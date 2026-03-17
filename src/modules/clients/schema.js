function validateClientPayload(payload, requireMonth) {
  const { name, location, sinceMonth, priorityId } = payload || {};
  const monthError = requireMonth(sinceMonth, 'sinceMonth');

  if (!name || !location || !priorityId || monthError) {
    return { error: monthError || 'name, location, sinceMonth and priorityId are required.' };
  }

  return {
    value: {
      name: name.trim(),
      location: location.trim(),
      sinceMonth,
      priorityId
    }
  };
}

module.exports = {
  validateClientPayload
};
