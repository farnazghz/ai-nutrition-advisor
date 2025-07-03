const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory storage for testing
let videos = [];
let channelInfo = null;

// YouTube API functions
const https = require('https');
const url = require('url');

async function makeHTTPSRequest(requestUrl) {
    return new Promise((resolve, reject) => {
        const parsedUrl = url.parse(requestUrl);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.path,
            method: 'GET'
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        });
        
        req.on('error', reject);
        req.end();
    });
}

// Routes
app.get('/api/videos', async (req, res) => {
    try {
        res.json(videos);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch videos' });
    }
});

app.get('/api/channel', async (req, res) => {
    try {
        if (!channelInfo) {
            const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
            const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
            
            const channelUrl = `https://www.googleapis.com/youtube/v3/channels?key=${YOUTUBE_API_KEY}&id=${CHANNEL_ID}&part=snippet,statistics`;
            const channelData = await makeHTTPSRequest(channelUrl);
            const channelResponse = JSON.parse(channelData);
            
            if (channelResponse.items && channelResponse.items.length > 0) {
                const channel = channelResponse.items[0];
                channelInfo = {
                    channelId: channel.id,
                    title: channel.snippet.title,
                    description: channel.snippet.description,
                    thumbnail: channel.snippet.thumbnails.medium.url,
                    subscriberCount: channel.statistics.subscriberCount,
                    videoCount: channel.statistics.videoCount,
                    viewCount: channel.statistics.viewCount,
                    publishedAt: channel.snippet.publishedAt
                };
            }
        }
        
        res.json(channelInfo);
    } catch (error) {
        console.error('Error fetching channel info:', error);
        res.status(500).json({ error: 'Failed to fetch channel information' });
    }
});

app.post('/api/sync-videos', async (req, res) => {
    try {
        const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
        const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
        
        console.log('🔄 Starting video sync...');
        
        // Get latest videos
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${CHANNEL_ID}&part=snippet&order=date&type=video&maxResults=5`;
        const searchData = await makeHTTPSRequest(searchUrl);
        const videoResults = JSON.parse(searchData);
        
        if (!videoResults.items) {
            throw new Error('No videos found');
        }
        
        console.log(`📺 Found ${videoResults.items.length} videos`);
        
        const processedVideos = [];
        
        for (const video of videoResults.items) {
            try {
                // Check if already processed
                if (videos.find(v => v.video_id === video.id.videoId)) {
                    console.log(`⏭️ Skipping already processed: ${video.snippet.title}`);
                    continue;
                }
                
                console.log(`🔄 Processing: ${video.snippet.title}`);
                
                // Get video details
                const videoUrl = `https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY}&id=${video.id.videoId}&part=snippet,statistics,contentDetails`;
                const videoResponse = await makeHTTPSRequest(videoUrl);
                const videoDetails = JSON.parse(videoResponse).items[0];
                
                // Check if we have enough content
                const contentToProcess = `${videoDetails.snippet.title}\n\n${videoDetails.snippet.description}`;
                
                if (contentToProcess.length < 100) {
                    console.log(`⏭️ Skipping insufficient content: ${video.snippet.title}`);
                    continue;
                }
                
                // Create a mock summary for now (since we can't use OpenAI without proper setup)
                const mockSummary = `This video "${videoDetails.snippet.title}" discusses nutrition and health topics. 
                Published on ${new Date(videoDetails.snippet.publishedAt).toLocaleDateString()}.
                
                Key points likely covered:
                - Nutrition recommendations
                - Health advice
                - Diet tips
                
                Based on video description: ${videoDetails.snippet.description.substring(0, 200)}...
                
                Note: This is a simplified summary. Full AI processing requires proper OpenAI setup.`;
                
                // Store video
                const processedVideo = {
                    video_id: videoDetails.id,
                    title: videoDetails.snippet.title,
                    description: videoDetails.snippet.description,
                    published_at: videoDetails.snippet.publishedAt,
                    duration: videoDetails.contentDetails.duration,
                    view_count: videoDetails.statistics.viewCount,
                    like_count: videoDetails.statistics.likeCount,
                    transcript: null,
                    summary: mockSummary,
                    keywords: ['nutrition', 'health', 'diet'], // Mock keywords
                    processed_at: new Date().toISOString()
                };
                
                videos.push(processedVideo);
                processedVideos.push(processedVideo);
                
                console.log(`✅ Processed: ${video.snippet.title}`);
                
            } catch (error) {
                console.error(`❌ Error processing ${video.snippet.title}:`, error.message);
                continue;
            }
        }
        
        console.log(`🎯 Sync completed: ${processedVideos.length} videos processed`);
        res.json({ success: true, processedCount: processedVideos.length });
        
    } catch (error) {
        console.error('Error syncing videos:', error);
        res.status(500).json({ error: 'Failed to sync videos: ' + error.message });
    }
});

app.post('/api/ask', async (req, res) => {
    try {
        const { question } = req.body;
        
        if (!question) {
            return res.status(400).json({ error: 'Question is required' });
        }

        // Simple keyword matching for demo
        const keywords = question.toLowerCase().split(/\s+/);
        const relevantVideos = videos.filter(video => {
            const videoText = `${video.title} ${video.description} ${video.summary}`.toLowerCase();
            return keywords.some(keyword => videoText.includes(keyword));
        });

        const mockAnswer = `Based on the available nutrition content, here's what I found regarding "${question}":

${relevantVideos.length > 0 ? 
  `I found ${relevantVideos.length} relevant videos that may help answer your question. The content suggests various nutrition approaches and recommendations.` : 
  'I don\'t have specific content that directly addresses this question in the processed videos.'
}

Please note: This is a simplified response system. For detailed AI-powered answers, full OpenAI integration is required.

Always consult with healthcare professionals for personalized nutrition advice.`;

        res.json({
            question,
            answer: mockAnswer,
            relevantVideos: relevantVideos.slice(0, 3).map(v => ({
                videoId: v.video_id,
                title: v.title,
                publishedAt: v.published_at
            }))
        });

    } catch (error) {
        console.error('Error answering question:', error);
        res.status(500).json({ error: 'Failed to process question' });
    }
});

app.get('/api/status', async (req, res) => {
    try {
        res.json({
            totalVideos: videos.length,
            lastVideoCheck: new Date().toISOString(),
            status: 'running (simplified mode)'
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get status' });
    }
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 AI Nutrition Advisor (Simplified) running on port ${PORT}`);
    console.log(`📱 Access the web interface at: http://localhost:${PORT}`);
    console.log('');
    console.log('🔧 Simplified Mode Features:');
    console.log('✅ YouTube API integration');
    console.log('✅ Channel information display');
    console.log('✅ Video fetching and basic processing');
    console.log('✅ Mock summaries and basic Q&A');
    console.log('⚠️ No SQLite database (using memory storage)');
    console.log('⚠️ No OpenAI integration (using mock responses)');
    console.log('');
    console.log('💡 To test: Click "Sync Recent Videos" button');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    process.exit(0);
});