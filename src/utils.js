// Function to get and parse prompts from prompts.json
export async function getPrompt(promptName, variables = {}) {
  try {
    // Fetch the prompts.json file
    const response = await fetch('/prompts.json');
    const prompts = await response.json();
    
    if (!prompts[promptName]) {
      throw new Error(`Prompt "${promptName}" not found`);
    }
    
    // Get the prompt templates
    const promptTemplates = prompts[promptName];
    
    // Replace variables in the templates
    const processedPrompt = {};
    for (const key in promptTemplates) {
      let text = promptTemplates[key];
      // Replace each variable in the template
      for (const varName in variables) {
        const regex = new RegExp(`\\{\\{${varName}\\}\\}`, 'g');
        text = text.replace(regex, variables[varName]);
      }
      processedPrompt[key] = text;
    }
    
    return processedPrompt;
  } catch (error) {
    console.error("Error loading prompt:", error);
    throw error;
  }
}