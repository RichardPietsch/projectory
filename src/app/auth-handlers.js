function buildAuthHandlers(deps) {
  const {
    getAuthMode,
    isInitialAdminRegistrationOpen,
    handleDbError,
    badRequest,
    validatePasswordStrength,
    pool,
    hashPassword,
    createOpaqueToken,
    AUTH_SESSION_TTL_HOURS,
    serializeSessionCookie,
    isValidEmail,
    verifyPassword,
    buildAuthThrottleKey,
    getAuthProtectionConfig,
    getAuthThrottleState,
    emitAuthSecurityEvent,
    obfuscateSecurityKey,
    sendAuthThrottle,
    registerAuthFailure,
    sendAuthFailure,
    clearAuthFailureState,
    PASSWORD_RESET_TTL_MINUTES,
    hashOpaqueToken,
    createPasswordResetToken,
    resolveSmtpSettingsRow,
    sendSmtpEmail,
    buildForgotPasswordEmailBody
  } = deps;

const authMeHandler = (req, res) => {
  res.json({
    userId: req.auth.userId,
    email: req.auth.email,
    displayName: req.auth.displayName,
    personId: req.auth.personId || null,
    role: req.auth.role,
    roles: req.auth.roles || [req.auth.role],
    permissions: req.auth.permissions,
    authSource: req.auth.authSource || 'header',
    scopedProjectIds: req.auth.scopedProjectIds || [],
    isScopedTeammate: Boolean(req.auth.isScopedTeammate),
    authMode: getAuthMode()
  });
};

const authBootstrapStatusHandler = async (_req, res) => {
  try {
    const registrationOpen = await isInitialAdminRegistrationOpen();
    return res.json({ registrationOpen });
  } catch (error) {
    return handleDbError(res, error);
  }
};

const authRegisterInitialAdminHandler = async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const displayName = String(req.body?.displayName || '').trim();
  const password = String(req.body?.password || '');

  if (!isValidEmail(email)) {
    return badRequest(res, 'Valid email is required.');
  }

  if (!displayName) {
    return badRequest(res, 'displayName is required.');
  }

  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    return badRequest(res, passwordError);
  }

  let client = null;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('LOCK TABLE users IN ACCESS EXCLUSIVE MODE');

    const registrationOpen = await isInitialAdminRegistrationOpen(client);
    if (!registrationOpen) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Initial admin registration is already completed.' });
    }

    const adminRole = await client.query(
      `SELECT id
       FROM roles
       WHERE LOWER(name) = 'admin'
       LIMIT 1`
    );

    if (adminRole.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Admin role is not configured.' });
    }

    const passwordHash = await hashPassword(password);
    const userInsert = await client.query(
      `INSERT INTO users (email, display_name, password_hash, is_active)
       VALUES ($1, $2, $3, TRUE)
       RETURNING id`,
      [email, displayName, passwordHash]
    );

    const userId = userInsert.rows[0]?.id;
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [userId, adminRole.rows[0].id]
    );

    const sessionId = createOpaqueToken(48);
    const expiresAt = new Date(Date.now() + (AUTH_SESSION_TTL_HOURS * 60 * 60 * 1000));
    await client.query(
      `INSERT INTO auth_sessions (id, user_id, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, userId, expiresAt.toISOString(), req.ip || null, req.header('user-agent') || null]
    );

    await client.query('COMMIT');
    res.setHeader('Set-Cookie', serializeSessionCookie(sessionId, expiresAt));
    return res.status(201).json({ ok: true, userId });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (_rollbackError) {
        // noop
      }
    }
    return handleDbError(res, error);
  } finally {
    if (client) client.release();
  }
};

const authLoginHandler = async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return badRequest(res, 'email and password are required.');
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const securityKey = buildAuthThrottleKey('login', { ip: req.ip || 'unknown', identifier: normalizedEmail || 'unknown' });
  const authConfig = getAuthProtectionConfig();
  const preflight = getAuthThrottleState(securityKey, authConfig);
  if (preflight.throttled) {
    emitAuthSecurityEvent('auth_login_throttled', {
      endpoint: '/api/auth/login',
      ipHash: obfuscateSecurityKey(req.ip || 'unknown'),
      identifierHash: obfuscateSecurityKey(normalizedEmail),
      failureCount: preflight.failureCount,
      retryAfterMs: preflight.retryAfterMs,
      lockout: preflight.locked
    });
    return sendAuthThrottle(res, 'Invalid email or password.', preflight.retryAfterMs);
  }

  try {
    const userResult = await pool.query(
      `SELECT id, email, display_name, person_id, password_hash, is_active
       FROM users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [normalizedEmail]
    );

    const user = userResult.rowCount > 0 ? userResult.rows[0] : null;
    const isValid = user?.password_hash ? await verifyPassword(password, user.password_hash) : false;

    if (!user || !user.is_active || !isValid) {
      const fail = registerAuthFailure(securityKey, authConfig);
      emitAuthSecurityEvent('auth_login_failed', {
        endpoint: '/api/auth/login',
        ipHash: obfuscateSecurityKey(req.ip || 'unknown'),
        identifierHash: obfuscateSecurityKey(normalizedEmail),
        userFound: Boolean(user),
        active: Boolean(user?.is_active),
        failureCount: fail.failures,
        retryAfterMs: fail.retryAfterMs,
        lockout: fail.locked
      });
      return sendAuthFailure(res, 401, 'Invalid email or password.');
    }

    const sessionId = createOpaqueToken(48);
    const expiresAt = new Date(Date.now() + (AUTH_SESSION_TTL_HOURS * 60 * 60 * 1000));

    await pool.query(
      `INSERT INTO auth_sessions (id, user_id, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, user.id, expiresAt.toISOString(), req.ip || null, req.header('user-agent') || null]
    );

    await pool.query(
      `UPDATE users
       SET failed_login_count = 0,
           locked_until = NULL,
           last_login_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    clearAuthFailureState(securityKey);
    res.setHeader('Set-Cookie', serializeSessionCookie(sessionId, expiresAt));
    return res.json({ ok: true });
  } catch (error) {
    return handleDbError(res, error);
  }
};

const authLogoutHandler = async (req, res) => {
  try {
    const sessionId = parseCookieHeader(req.headers.cookie).get(AUTH_SESSION_COOKIE);
    if (sessionId) {
      await pool.query(
        `UPDATE auth_sessions
         SET revoked_at = NOW()
         WHERE id = $1`,
        [sessionId]
      );
    }
    res.setHeader('Set-Cookie', clearSessionCookie());
    return res.json({ ok: true });
  } catch (error) {
    return handleDbError(res, error);
  }
};

const authForgotPasswordHandler = async (req, res) => {
  const email = String(req.body?.email || '').trim();
  if (!email) {
    return badRequest(res, 'email is required.');
  }

  try {
    const userResult = await pool.query(
      `SELECT id, email, display_name
       FROM users
       WHERE LOWER(email) = LOWER($1)
         AND is_active = TRUE
       LIMIT 1`,
      [email]
    );

    if (userResult.rowCount > 0) {
      const user = userResult.rows[0];
      const reset = await createPasswordResetToken(user.id, req.ip || null);

      const smtpResult = await pool.query(
        `SELECT host, port, username, password, from_email, secure, enabled
         FROM smtp_settings
         WHERE id = 1`
      );
      const smtp = smtpResult.rows[0] ? await resolveSmtpSettingsRow(smtpResult.rows[0], { persistLegacyUpgrade: true }) : null;

      if (smtp && smtp.enabled && smtp.host && smtp.port && smtp.from_email) {
        try {
          await sendSmtpEmail(smtp, {
            toEmail: String(user.email || '').trim().toLowerCase(),
            subject: 'Projectory password reset',
            textBody: buildForgotPasswordEmailBody({ resetLink: reset.resetLink, expiresMinutes: reset.expiresMinutes })
          });
        } catch (error) {
          emitAuthSecurityEvent('auth_password_reset_email_failed', {
            endpoint: '/api/auth/forgot-password',
            ipHash: obfuscateSecurityKey(req.ip || 'unknown'),
            identifierHash: obfuscateSecurityKey(email),
            reason: String(error?.message || 'unknown')
          });
        }
      }

      if (process.env.AUTH_RETURN_DEBUG_TOKENS === 'true') {
        return res.json({ ok: true, debugToken: reset.token, resetLink: reset.resetLink });
      }
    }

    return res.json({ ok: true });
  } catch (error) {
    return handleDbError(res, error);
  }
};

const authResetPasswordHandler = async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');

  if (!token || !password) {
    return badRequest(res, 'token and password are required.');
  }

  const validationError = validatePasswordStrength(password);
  if (validationError) {
    return badRequest(res, validationError);
  }

  const tokenHash = hashOpaqueToken(token);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tokenResult = await client.query(
      `SELECT id, user_id
       FROM password_reset_tokens
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );

    if (tokenResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    }

    const passwordHash = await hashPassword(password);

    await client.query(
      `UPDATE users
       SET password_hash = $1,
           failed_login_count = 0,
           locked_until = NULL
       WHERE id = $2`,
      [passwordHash, tokenResult.rows[0].user_id]
    );

    await client.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE id = $1`,
      [tokenResult.rows[0].id]
    );

    await client.query('COMMIT');
    return res.json({ ok: true });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    return handleDbError(res, error);
  } finally {
    if (client) client.release();
  }
};


const authInvitePreviewHandler = async (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (!token) {
    return badRequest(res, 'token is required.');
  }

  try {
    const tokenHash = hashOpaqueToken(token);
    const result = await pool.query(
      `SELECT u.id AS user_id, u.email, u.display_name, ui.expires_at
       FROM user_invites ui
       JOIN users u ON u.id = ui.user_id
       WHERE ui.token_hash = $1
         AND ui.accepted_at IS NULL
         AND ui.expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ error: 'Invalid or expired invite token.' });
    }

    const invite = result.rows[0];
    return res.json({
      ok: true,
      user: {
        email: invite.email,
        displayName: invite.display_name,
        expiresAt: invite.expires_at
      }
    });
  } catch (error) {
    return handleDbError(res, error);
  }
};

const authAcceptInviteHandler = async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');

  if (!token || !password) {
    return badRequest(res, 'token and password are required.');
  }

  const validationError = validatePasswordStrength(password);
  if (validationError) {
    return badRequest(res, validationError);
  }

  const throttleKey = buildAuthThrottleKey('accept-invite', { ip: req.ip || 'unknown', identifier: token });
  const authConfig = getAuthProtectionConfig();
  const preflight = getAuthThrottleState(throttleKey, authConfig);
  if (preflight.throttled) {
    emitAuthSecurityEvent('auth_invite_accept_throttled', {
      endpoint: '/api/auth/accept-invite',
      ipHash: obfuscateSecurityKey(req.ip || 'unknown'),
      tokenHash: obfuscateSecurityKey(token),
      failureCount: preflight.failureCount,
      retryAfterMs: preflight.retryAfterMs,
      lockout: preflight.locked
    });
    return sendAuthThrottle(res, 'Invite activation failed.', preflight.retryAfterMs);
  }

  const tokenHash = hashOpaqueToken(token);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inviteResult = await client.query(
      `SELECT id, user_id
       FROM user_invites
       WHERE token_hash = $1
         AND accepted_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );

    if (inviteResult.rowCount === 0) {
      await client.query('ROLLBACK');
      const fail = registerAuthFailure(throttleKey, authConfig);
      emitAuthSecurityEvent('auth_invite_accept_failed', {
        endpoint: '/api/auth/accept-invite',
        ipHash: obfuscateSecurityKey(req.ip || 'unknown'),
        tokenHash: obfuscateSecurityKey(token),
        failureCount: fail.failures,
        retryAfterMs: fail.retryAfterMs,
        lockout: fail.locked,
        reason: 'invalid_token'
      });
      return sendAuthFailure(res, 400, 'Invite activation failed.');
    }

    const passwordHash = await hashPassword(password);
    await client.query(
      `UPDATE users
       SET password_hash = $1,
           is_active = TRUE,
           failed_login_count = 0,
           locked_until = NULL
       WHERE id = $2`,
      [passwordHash, inviteResult.rows[0].user_id]
    );

    await client.query(
      `UPDATE user_invites
       SET accepted_at = NOW()
       WHERE id = $1`,
      [inviteResult.rows[0].id]
    );

    const userInfo = await client.query(`SELECT email, display_name FROM users WHERE id = $1 LIMIT 1`, [inviteResult.rows[0].user_id]);

    await client.query('COMMIT');
    clearAuthFailureState(throttleKey);
    return res.json({ ok: true, email: userInfo.rows[0]?.email || null, displayName: userInfo.rows[0]?.display_name || null });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    return handleDbError(res, error);
  } finally {
    if (client) client.release();
  }
};



  return {
    me: authMeHandler,
    bootstrapStatus: authBootstrapStatusHandler,
    registerInitialAdmin: authRegisterInitialAdminHandler,
    login: authLoginHandler,
    logout: authLogoutHandler,
    forgotPassword: authForgotPasswordHandler,
    resetPassword: authResetPasswordHandler,
    invitePreview: authInvitePreviewHandler,
    acceptInvite: authAcceptInviteHandler
  };
}

module.exports = { buildAuthHandlers };
