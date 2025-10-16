// Provides prompt template functionality for client-side use

import prompts from './prompts.js';

/**
 * Get a prompt by its path and format it with the provided variables
 *
 * @param {string} promptPath - Path to the prompt in dot notation (e.g., "landmarks.discovery")
 * @param {Object} variables - Variables to substitute in the template
 * @returns {string|null} - Formatted prompt or null if not found
 */
export function GetPrompt(promptPath, variables = {}) {
  try {
    // Navigate through the prompt structure using the path
    const pathParts = promptPath.split('.');
    let current = prompts;

    for (const part of pathParts) {
      if (!(part in current)) {
        console.error(`Prompt path not found: ${promptPath}`);
        return null;
      }
      current = current[part];
    }

    // Check if we have a template
    if (typeof current !== 'object' || !current.template) {
      console.error(`No template found at prompt path: ${promptPath}`);
      return null;
    }

    // Get the template and format it with variables
    const template = current.template;

    // Check for missing variables
    const missingVars = findMissingVariables(template, variables);
    if (missingVars.length > 0) {
      console.error(
        `Missing variables in prompt template: ${missingVars.join(', ')}`
      );
      return null;
    }

    // Format the template using JavaScript template literals
    return formatTemplate(template, variables);
  } catch (error) {
    console.error(`Error getting prompt: ${error.message}`);
    return null;
  }
}

/**
 * Find missing variables in a template
 *
 * @param {string} template - Template string with ${variable} placeholders
 * @param {Object} variables - Available variables
 * @returns {Array} - Array of missing variable names
 */
function findMissingVariables(template, variables) {
  const missingVars = [];

  // Find all {variable} patterns in the template, but only simple variable names
  const variablePattern = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
  let match;

  while ((match = variablePattern.exec(template)) !== null) {
    const varName = match[1].trim();

    if (!(varName in variables)) {
      if (!missingVars.includes(varName)) {
        missingVars.push(varName);
      }
    }
  }

  return missingVars;
}

/**
 * Format a template with variables using JavaScript template literals
 *
 * @param {string} template - Template string with ${variable} placeholders
 * @param {Object} variables - Variables to substitute
 * @returns {string} - Formatted template
 */
function formatTemplate(template, variables) {
  try {
    // Simple string replacement approach to avoid scope issues
    let result = template;

    // Replace each {variable} with its value
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{${key}}`;
      const regex = new RegExp(
        placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'g'
      );
      result = result.replace(regex, value);
    }

    return result;
  } catch (error) {
    console.error(`Error formatting template: ${error.message}`);
    throw new Error(`Template formatting failed: ${error.message}`);
  }
}

/**
 * Get a system message for AI models
 *
 * @param {string} messageType - Type of system message (e.g., "travel_agent")
 * @param {Object} variables - Variables to substitute (optional)
 * @returns {string|null} - System message or null if not found
 */
export function GetSystemMessage(messageType, variables = {}) {
  return GetPrompt(`system_messages.${messageType}`, variables);
}

/**
 * Validate that all required variables are provided for a prompt
 *
 * @param {string} promptPath - Path to the prompt
 * @param {Object} variables - Variables to check
 * @returns {Object} - Validation result with success boolean and missing variables array
 */
export function ValidatePromptVariables(promptPath, variables = {}) {
  try {
    // Navigate to the prompt
    const pathParts = promptPath.split('.');
    let current = prompts;

    for (const part of pathParts) {
      if (!(part in current)) {
        return {
          success: false,
          error: `Prompt path not found: ${promptPath}`,
          missing: [],
        };
      }
      current = current[part];
    }

    if (typeof current !== 'object' || !current.template) {
      return {
        success: false,
        error: `No template found at prompt path: ${promptPath}`,
        missing: [],
      };
    }

    // Find missing variables
    const missingVars = findMissingVariables(current.template, variables);

    return {
      success: missingVars.length === 0,
      error:
        missingVars.length > 0
          ? `Missing variables: ${missingVars.join(', ')}`
          : null,
      missing: missingVars,
    };
  } catch (error) {
    return {
      success: false,
      error: `Validation error: ${error.message}`,
      missing: [],
    };
  }
}
