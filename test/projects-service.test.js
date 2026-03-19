const test = require('node:test');
const assert = require('node:assert/strict');

const projectsService = require('../src/modules/projects/service');
const projectsRepo = require('../src/modules/projects/repo');

test('projects service filters snapshot by scoped project ids', () => {
  const filtered = projectsService.filterScopedSnapshot(
    {
      projects: [{ id: 1 }, { id: 2 }],
      challenges: [{ id: 10, project_id: 1 }, { id: 20, project_id: 2 }],
      assignments: [{ id: 100, project_id: 1 }, { id: 200, project_id: 3 }]
    },
    [1]
  );

  assert.deepEqual(filtered.projects, [{ id: 1 }]);
  assert.deepEqual(filtered.challenges, [{ id: 10, project_id: 1 }]);
  assert.deepEqual(filtered.assignments, [{ id: 100, project_id: 1 }]);
});

test('projects service createProject returns validation error for bad start month', async () => {
  const result = await projectsService.createProject(
    {},
    { clientId: 1, name: 'P', startMonth: '2024/01', budgetEuros: 10 },
    {
      requireMonth: (value, fieldName) => (!/^\d{4}-\d{2}$/.test(value) ? `${fieldName} must be in yyyy-mm format.` : null),
      normalizeProjectStatus: (status) => status || 'white'
    }
  );

  assert.equal(result.error, 'startMonth must be in yyyy-mm format.');
});

test('projects service createProject delegates persistence and normalizes status/budget', async () => {
  const originalInsertProject = projectsRepo.insertProject;
  const calls = [];
  projectsRepo.insertProject = async (_pool, payload) => {
    calls.push(payload);
    return { rows: [{ id: 77 }] };
  };

  try {
    const result = await projectsService.createProject(
      {},
      { clientId: 4, name: '  New Project  ', status: 'GREEN', startMonth: '2024-01', budgetEuros: 123.45 },
      {
        requireMonth: () => null,
        normalizeProjectStatus: (status) => String(status).toLowerCase()
      }
    );

    assert.deepEqual(calls[0], {
      clientId: 4,
      name: 'New Project',
      status: 'green',
      startMonth: '2024-01',
      endMonth: null,
      budgetCents: 12345
    });
    assert.deepEqual(result.value, { id: 77 });
  } finally {
    projectsRepo.insertProject = originalInsertProject;
  }
});

test('projects service updatePersonProjectQuantity returns notFound when no assignments exist', async () => {
  const fakeClient = {
    queries: [],
    async query(sql) {
      this.queries.push(sql);
      return {};
    },
    releaseCalled: false,
    release() {
      this.releaseCalled = true;
    }
  };
  const fakePool = { connect: async () => fakeClient };

  const originalListAssignments = projectsRepo.listAssignmentsByProjectPerson;
  projectsRepo.listAssignmentsByProjectPerson = async () => ({ rowCount: 0 });

  try {
    const result = await projectsService.updatePersonProjectQuantity(
      fakePool,
      1,
      2,
      30,
      { distributeProjectQuantityAcrossAssignments: async () => {} }
    );

    assert.equal(result.notFound, true);
    assert.equal(result.error, 'No assignments found for this person in the selected project.');
    assert.equal(fakeClient.releaseCalled, true);
  } finally {
    projectsRepo.listAssignmentsByProjectPerson = originalListAssignments;
  }
});
