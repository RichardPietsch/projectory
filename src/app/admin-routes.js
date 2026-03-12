function registerAdminRoutes(deps) {
  const { app, requirePermission, PERMISSIONS, pool, handleDbError, badRequest, isValidEmail, getRoleIdByName, getAdminUserIds, adminUserManagementRouteRateLimitMiddleware, createOpaqueToken, hashOpaqueToken, replaceUserProjectScope, sendSmtpTestEmail, adminAuditRouteRateLimitMiddleware, createUserInvite, resolveSmtpSettingsRow, sendSmtpEmail, buildInviteEmailBody, resolveBootstrapAdminId, redactSmtpSettings, encryptSmtpPassword } = deps;

app.get('/api/admin/users', adminUserManagementRouteRateLimitMiddleware, requirePermission(PERMISSIONS.ADMIN_ACCESS), async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id,
              u.email,
              u.display_name,
              u.is_active,
              u.person_id,
              u.password_hash,
              u.last_login_at,
              p.first_name,
              p.last_name,
              NULL::text AS person_email,
              COALESCE(ARRAY_AGG(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) AS roles,
              latest_invite.id AS latest_invite_id,
              latest_invite.created_at AS latest_invited_at,
              latest_invite.expires_at AS latest_invite_expires_at,
              latest_invite.accepted_at AS latest_invite_accepted_at
       FROM users u
       LEFT JOIN people p ON p.id = u.person_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       LEFT JOIN LATERAL (
         SELECT id, created_at, expires_at, accepted_at
         FROM user_invites ui
         WHERE ui.user_id = u.id
         ORDER BY ui.created_at DESC
         LIMIT 1
       ) latest_invite ON TRUE
       GROUP BY u.id, u.email, u.display_name, u.is_active, u.person_id, u.password_hash, u.last_login_at,
                p.first_name, p.last_name,
                latest_invite.id, latest_invite.created_at, latest_invite.expires_at, latest_invite.accepted_at
       ORDER BY u.created_at DESC, u.id DESC`
    );

    return res.json(result.rows.map((row) => {
      const hasInvite = Boolean(row.latest_invited_at);
      const inviteAccepted = Boolean(row.latest_invite_accepted_at);
      const inviteExpired = hasInvite && !inviteAccepted && new Date(row.latest_invite_expires_at).getTime() <= Date.now();
      const status = !row.is_active
        ? 'inactive'
        : inviteAccepted
          ? 'active'
          : inviteExpired
            ? 'invite_expired'
            : hasInvite
              ? 'invited'
              : row.password_hash
                ? 'active'
                : 'provisioned';

      return {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        isActive: row.is_active,
        personId: row.person_id,
        personName: row.person_id ? `${row.first_name || ''} ${row.last_name || ''}`.trim() : null,
        personEmail: row.person_email || null,
        roles: row.roles || [],
        status,
        hasPassword: Boolean(row.password_hash),
        lastLoginAt: row.last_login_at || null,
        latestInvitedAt: row.latest_invited_at || null,
        latestInviteExpiresAt: row.latest_invite_expires_at || null,
        latestInviteAcceptedAt: row.latest_invite_accepted_at || null,
        latestInviteId: row.latest_invite_id || null,
        canRevokeInvite: status === 'invited'
      };
    }));
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.post('/api/admin/users', adminUserManagementRouteRateLimitMiddleware, requirePermission(PERMISSIONS.ADMIN_ACCESS), async (req, res) => {
  const { email, displayName, role, personId, isActive } = req.body || {};

  if (!isValidEmail(email)) {
    return badRequest(res, 'Valid email is required.');
  }

  if (!displayName || !String(displayName).trim()) {
    return badRequest(res, 'displayName is required.');
  }

  try {
    const selectedRole = await getRoleIdByName(role || 'viewer');
    if (!selectedRole) {
      return badRequest(res, 'role must reference an existing role.');
    }
    const insert = await pool.query(
      `INSERT INTO users (email, display_name, person_id, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [String(email).trim().toLowerCase(), String(displayName).trim(), personId || null, isActive !== false]
    );

    await pool.query(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [insert.rows[0].id, selectedRole.id]
    );

    return res.status(201).json({ id: insert.rows[0].id });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.put('/api/admin/users/:id', adminUserManagementRouteRateLimitMiddleware, requirePermission(PERMISSIONS.ADMIN_ACCESS), async (req, res) => {
  const { email, displayName, role, personId, isActive } = req.body || {};
  if (!displayName || !String(displayName).trim()) {
    return badRequest(res, 'displayName is required.');
  }

  if (!isValidEmail(email)) {
    return badRequest(res, 'Valid email is required.');
  }

  let client = null;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const existingLookup = await client.query(
      `SELECT u.id,
              u.person_id,
              u.is_active,
              COALESCE(ARRAY_AGG(DISTINCT LOWER(r.name)) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1
       GROUP BY u.id, u.person_id, u.is_active`,
      [req.params.id]
    );

    if (existingLookup.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found.' });
    }

    const existingUser = existingLookup.rows[0];
    const existingRoles = existingUser.roles || [];
    const isCurrentlyAdmin = existingRoles.includes('admin');
    const nextRoleName = role === undefined ? (existingRoles[0] || 'viewer') : String(role).trim().toLowerCase();

    const selectedRole = await getRoleIdByName(nextRoleName);
    if (!selectedRole) {
      await client.query('ROLLBACK');
      return badRequest(res, 'role must reference an existing role.');
    }

    const isDemotingFromAdmin = isCurrentlyAdmin && String(selectedRole.name || '').toLowerCase() !== 'admin';
    if (isDemotingFromAdmin) {
      const adminCountResult = await client.query(
        `SELECT COUNT(DISTINCT ur.user_id) AS admin_count
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE LOWER(r.name) = 'admin'`
      );
      const adminCount = Number(adminCountResult.rows[0]?.admin_count || 0);
      if (adminCount <= 1) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'At least one admin must remain. Add another admin before changing this role.' });
      }
    }

    const resolvedPersonId = personId === undefined ? existingUser.person_id : (personId || null);
    const resolvedIsActive = isActive === undefined ? existingUser.is_active : (isActive !== false);

    await client.query(
      `UPDATE users
       SET email = $1,
           display_name = $2,
           person_id = $3,
           is_active = $4
       WHERE id = $5`,
      [String(email).trim().toLowerCase(), String(displayName).trim(), resolvedPersonId, resolvedIsActive, req.params.id]
    );

    await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [req.params.id]);
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [req.params.id, selectedRole.id]
    );

    await client.query('COMMIT');
    return res.json({ ok: true });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    return handleDbError(res, error);
  } finally {
    if (client) client.release();
  }
});

app.delete('/api/admin/users/:id', adminUserManagementRouteRateLimitMiddleware, requirePermission(PERMISSIONS.ADMIN_ACCESS), async (req, res) => {
  try {
    if (req.auth?.userId && Number(req.params.id) === Number(req.auth.userId)) {
      return res.status(409).json({ error: 'You cannot delete your own account.' });
    }

    const adminUserIds = await getAdminUserIds();
    if (adminUserIds.length < 2) {
      return res.status(409).json({ error: 'Add a second admin before deleting users.' });
    }

    const deleted = await pool.query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
    if (deleted.rowCount === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({ ok: true });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.post('/api/admin/users/:id/invite', requirePermission(PERMISSIONS.ADMIN_ACCESS), async (req, res) => {
  const expiresHours = Number(req.body?.expiresHours || 72);
  if (!Number.isFinite(expiresHours) || expiresHours < 1 || expiresHours > 168) {
    return badRequest(res, 'expiresHours must be between 1 and 168.');
  }

  try {
    const userResult = await pool.query(
      `SELECT id, email, is_active
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [req.params.id]
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (!userResult.rows[0].is_active) {
      return res.status(409).json({ error: 'Cannot invite an inactive user.' });
    }

    const adminUserIds = await getAdminUserIds();
    const bootstrapAdminId = resolveBootstrapAdminId(adminUserIds);
    if (bootstrapAdminId && Number(req.params.id) === bootstrapAdminId) {
      return res.status(409).json({ error: 'The initial admin account cannot be invited.' });
    }

    const invite = await createUserInvite(userResult.rows[0].id, req.auth.userId, expiresHours);

    const smtpResult = await pool.query(
      `SELECT host, port, username, password, from_email, secure, enabled
       FROM smtp_settings
       WHERE id = 1`
    );
    const smtp = smtpResult.rows[0] ? await resolveSmtpSettingsRow(smtpResult.rows[0], { persistLegacyUpgrade: true }) : null;

    if (!smtp || !smtp.enabled || !smtp.host || !smtp.port || !smtp.from_email) {
      return res.status(409).json({ error: 'SMTP is not configured. Configure SMTP settings before sending invites.' });
    }


    await sendSmtpEmail(smtp, {
      toEmail: String(userResult.rows[0].email || '').trim(),
      subject: 'Projectory account invitation',
      textBody: buildInviteEmailBody({
        inviteLink: invite.inviteLink,
        recipientName: userResult.rows[0].email,
        expiresHours
      })
    });

    return res.json({
      ok: true,
      deliveryStatus: 'sent',
      inviteLink: process.env.AUTH_RETURN_DEBUG_TOKENS === 'true' ? invite.inviteLink : undefined,
      inviteToken: process.env.AUTH_RETURN_DEBUG_TOKENS === 'true' ? invite.token : undefined
    });
  } catch (error) {
    return handleDbError(res, error);
  }
});


app.post('/api/admin/users/:id/invite/revoke', requirePermission(PERMISSIONS.ADMIN_ACCESS), async (req, res) => {
  try {
    const revoked = await pool.query(
      `UPDATE user_invites
       SET expires_at = NOW()
       WHERE user_id = $1
         AND accepted_at IS NULL
         AND expires_at > NOW()`,
      [req.params.id]
    );

    if (revoked.rowCount === 0) {
      return res.status(404).json({ error: 'No active invite to revoke for this user.' });
    }

    return res.json({ ok: true, revoked: revoked.rowCount });
  } catch (error) {
    return handleDbError(res, error);
  }
});


app.get('/api/admin/users/:id/project-access', requirePermission(PERMISSIONS.ADMIN_ACCESS), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT project_id
       FROM user_project_access
       WHERE user_id = $1
       ORDER BY project_id`,
      [req.params.id]
    );

    return res.json({
      userId: Number(req.params.id),
      projectIds: result.rows.map((row) => Number(row.project_id))
    });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.put('/api/admin/users/:id/project-access', requirePermission(PERMISSIONS.ADMIN_ACCESS), async (req, res) => {
  const projectIds = Array.isArray(req.body?.projectIds) ? req.body.projectIds : null;
  if (!projectIds) {
    return badRequest(res, 'projectIds must be an array.');
  }

  try {
    const userResult = await pool.query(
      `SELECT id FROM users WHERE id = $1 LIMIT 1`,
      [req.params.id]
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Persist full replacement to keep admin UX predictable.
    const normalized = await replaceUserProjectScope(req.params.id, projectIds);
    return res.json({ ok: true, projectIds: normalized });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.get('/api/admin/smtp-settings', requirePermission(PERMISSIONS.ADMIN_ACCESS), async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT host, port, username, password, from_email, secure, enabled
       FROM smtp_settings
       WHERE id = 1`
    );

    const resolved = await resolveSmtpSettingsRow(result.rows[0] || {}, { persistLegacyUpgrade: true });
    return res.json(redactSmtpSettings(resolved));
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.put('/api/admin/smtp-settings', requirePermission(PERMISSIONS.ADMIN_ACCESS), async (req, res) => {
  const { host, port, username, password, fromEmail, secure, enabled } = req.body || {};

  if (enabled && (!host || !port || !fromEmail)) {
    return badRequest(res, 'host, port and fromEmail are required when SMTP is enabled.');
  }

  if (fromEmail && !isValidEmail(fromEmail)) {
    return badRequest(res, 'fromEmail must be a valid email address.');
  }

  try {
    await pool.query(
      `UPDATE smtp_settings
       SET host = $1,
           port = $2,
           username = $3,
           password = COALESCE($4, password),
           from_email = $5,
           secure = $6,
           enabled = $7,
           updated_at = NOW()
       WHERE id = 1`,
      [host || null, port || null, username || null, password ? encryptSmtpPassword(password) : null, fromEmail || null, secure !== false, Boolean(enabled)]
    );

    const refreshed = await pool.query(
      `SELECT host, port, username, password, from_email, secure, enabled
       FROM smtp_settings
       WHERE id = 1`
    );

    const resolved = await resolveSmtpSettingsRow(refreshed.rows[0] || {}, { persistLegacyUpgrade: true });
    return res.json(redactSmtpSettings(resolved));
  } catch (error) {
    return handleDbError(res, error);
  }
});



app.post('/api/admin/smtp-settings/test-email', requirePermission(PERMISSIONS.ADMIN_ACCESS), async (req, res) => {
  const toEmail = String(req.body?.toEmail || '').trim();
  const dryRun = Boolean(req.body?.dryRun);

  if (!isValidEmail(toEmail)) {
    return badRequest(res, 'toEmail must be a valid email address.');
  }

  try {
    const current = await pool.query(
      `SELECT host, port, username, password, from_email, secure, enabled
       FROM smtp_settings
       ORDER BY id DESC
       LIMIT 1`
    );

    const smtp = current.rows[0] ? await resolveSmtpSettingsRow(current.rows[0], { persistLegacyUpgrade: true }) : null;
    if (!smtp || !smtp.enabled) {
      return badRequest(res, 'SMTP must be enabled before sending test email.');
    }

    if (!smtp.host || !smtp.port || !smtp.from_email) {
      return badRequest(res, 'SMTP host, port and fromEmail are required.');
    }

    if (!dryRun) {
      await sendSmtpTestEmail(smtp, toEmail);
    }

    return res.json({ ok: true, toEmail, dryRun });
  } catch (error) {
    const reason = String(error?.message || 'Unknown SMTP failure');
    const hint = /AUTH|535|5\.7\./i.test(reason)
      ? 'Check SMTP auth mode/app password and whether the provider requires OAuth/app-specific passwords.'
      : /STARTTLS|TLS|SSL|certificate|alert/i.test(reason)
        ? 'Check secure setting vs port (465 implicit TLS, 587 STARTTLS) and certificate trust.'
        : /RCPT TO|550|553|recipient/i.test(reason)
          ? 'Verify the test recipient address is accepted by the SMTP provider.'
          : 'Check host/port reachability and provider restrictions.';
    return res.status(502).json({ error: `SMTP test failed: ${reason}`, hint });
  }
});

app.get('/api/admin/audit', requirePermission(PERMISSIONS.ADMIN_ACCESS), adminAuditRouteRateLimitMiddleware, async (req, res) => {
  const limit = Math.max(1, Math.min(Number.parseInt(req.query.limit || '100', 10) || 100, 500));
  const actorUserId = req.query.actorUserId ? Number.parseInt(req.query.actorUserId, 10) : null;
  const entityType = String(req.query.entityType || '').trim();
  const action = String(req.query.action || '').trim();

  try {
    const result = await pool.query(
      `SELECT id, actor_user_id, actor_role, action, entity_type, entity_id, status_code, request_path, ip_address, user_agent, metadata_json, created_at
       FROM audit_log
       WHERE ($1::int IS NULL OR actor_user_id = $1)
         AND ($2::text = '' OR entity_type = $2)
         AND ($3::text = '' OR action ILIKE ('%' || $3 || '%'))
       ORDER BY created_at DESC
       LIMIT $4`,
      [Number.isInteger(actorUserId) ? actorUserId : null, entityType, action, limit]
    );

    return res.json({ entries: result.rows });
  } catch (error) {
    return handleDbError(res, error);
  }
});


}

module.exports = { registerAdminRoutes };
