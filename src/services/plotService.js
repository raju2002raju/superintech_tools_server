const openai = require('../config/openaiConfig');

async function generatePlot(topic, storyType, creativity, length) {
  try {
    const prompt = `You are an advanced AI plot generator. Your task is to create a unique and engaging plot with a title based on the given inputs. 

Use the following inputs to create your plot:

Topic: ${topic}
Story Type: ${storyType}
Creativity Level: ${creativity}
Length: ${length}

Your response should be formatted in the following structure:

Title: [Your Generated Title]

Logline: [A one-sentence summary of the plot]

Setting:
[Description of the setting]

Characters:
[List of main characters with brief descriptions]

Plot:
Act I:
[Opening situation and inciting incident]

Act II:
[Conflict development and rising action]

Act III:
[Climax and resolution]

Themes:
[Main themes explored in the story]

Please generate a ${length} plot about ${topic} in a ${storyType} style with ${creativity} creativity.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }]
    });

    if (response.choices && response.choices.length > 0) {
      return response.choices[0].message.content;
    } else {
      throw new Error('Unexpected response structure from OpenAI API');
    }
  } catch (error) {
    console.error('Error generating plot:', error);
    throw new Error('Failed to generate plot');
  }
}

module.exports = { generatePlot };
