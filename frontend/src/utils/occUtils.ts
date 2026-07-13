export function formatTimestamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getOutcomeMessage(
  outcome: 'committed' | 'conflict_failed',
  errorMessage: string | null
) {
  if (outcome === 'committed') {
    return 'Commit completed successfully.';
  }

  return getFriendlyError(errorMessage);
}

export function getErrorType(
  outcome: 'committed' | 'conflict_failed',
  errorType: string | null
) {
  if (outcome === 'committed') {
    return '—';
  }

  return errorType ?? 'Unknown';
}

export function getFriendlyError(errorMessage: string | null) {
  if (!errorMessage) {
    return 'No error details available.';
  }

  const message = errorMessage.toLowerCase();

  if (
    message.includes('validationexception') ||
    message.includes('found conflicting files')
  ) {
    return (
      'Concurrent write detected.\n\n' +
      'Another transaction committed changes before this writer could commit.\n\n' +
      'Apache Iceberg rejected this commit to maintain table consistency.'
    );
  }

  if (message.includes('py4jjavaerror')) {
    return (
      'Spark reported an Iceberg commit failure.\n\n' +
      'See the technical details for the underlying Java exception.'
    );
  }

  if (message.includes('timeout')) {
    return (
      'The OCC operation timed out before completing.'
    );
  }

  return 'An unexpected OCC error occurred. See the technical details below.';
}