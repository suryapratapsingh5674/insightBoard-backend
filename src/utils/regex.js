/**
 * Utility to escape special characters for safe regular expression queries
 * Prevents ReDoS attacks and RegExp syntax errors on user input (e.g. +, *, ?, (, ))
 */
export const escapeRegex = (string = '') => {
  if (typeof string !== 'string') return '';
  return string.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
