const { generatePlot } = require('../services/plotService');

async function plotGenerator(req, res) {
  const { topic, storyType, creativity, length } = req.body;

  if (!topic) {
    return res.status(400).json({ error: 'Topic is required' });
  }

  try {
    const plot = await generatePlot(topic, storyType, creativity, length);
    res.json({ plot });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = { plotGenerator };
