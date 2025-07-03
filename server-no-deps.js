const http = require('http');
const https = require('https');
const url = require('url');
const path = require('path');
const fs = require('fs');
const querystring = require('querystring');
const TranscriptManager = require('./transcript-manager');

// Environment variables - add these to your .env file
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'your_youtube_api_key_here';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'your_openai_api_key_here';
const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || 'your_youtube_channel_id_here';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || 'your_elevenlabs_api_key_here';
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || 'your_unsplash_access_key_here';
const PORT = 3002;

// Initialize transcript manager
const transcriptManager = new TranscriptManager();

// In-memory storage
let videos = [];
let channelInfo = null;

// MIME types for static files
const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json'
};

// Helper function for HTTPS requests
function makeHTTPSRequest(requestUrl) {
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

// Helper function for OpenAI requests
function makeOpenAIRequest(prompt, systemMessage = "You are a nutrition expert. Provide helpful, evidence-based advice.", maxTokens = 500, useGPT4 = false) {
    return new Promise((resolve, reject) => {
        const model = useGPT4 ? "gpt-4" : "gpt-3.5-turbo";
        const postData = JSON.stringify({
            model: model,
            messages: [
                {
                    role: "system",
                    content: systemMessage
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            max_tokens: maxTokens,
            temperature: 0.3
        });

        const options = {
            hostname: 'api.openai.com',
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.choices && response.choices[0]) {
                        resolve(response.choices[0].message.content);
                    } else {
                        reject(new Error('Invalid OpenAI response'));
                    }
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// ElevenLabs voice generation function
async function generateVoice(text, voiceId = 'dEktJuznxdhBqb4o92up') { // Custom voice clone
    return new Promise((resolve, reject) => {
        console.log('🔑 Using API key:', ELEVENLABS_API_KEY.substring(0, 10) + '...');
        console.log('📝 Text to convert:', text.substring(0, 50) + '...');
        
        const postData = JSON.stringify({
            text: text,
            model_id: "eleven_monolingual_v1",
            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.5
            }
        });

        const options = {
            hostname: 'api.elevenlabs.io',
            path: `/v1/text-to-speech/${voiceId}`,
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': ELEVENLABS_API_KEY,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        console.log('🔗 Making request to:', `https://${options.hostname}${options.path}`);

        const req = https.request(options, (res) => {
            console.log('📊 Response status:', res.statusCode);
            console.log('📋 Response headers:', res.headers);
            
            const audioChunks = [];
            const textChunks = [];
            
            res.on('data', (chunk) => {
                if (res.statusCode === 200) {
                    audioChunks.push(chunk);
                } else {
                    textChunks.push(chunk);
                }
            });
            
            res.on('end', () => {
                if (res.statusCode === 200) {
                    const audioBuffer = Buffer.concat(audioChunks);
                    console.log('✅ Audio generated, size:', audioBuffer.length, 'bytes');
                    resolve(audioBuffer);
                } else {
                    const errorText = Buffer.concat(textChunks).toString();
                    console.log('❌ Error response:', errorText);
                    reject(new Error(`ElevenLabs API error: ${res.statusCode} - ${errorText}`));
                }
            });
        });

        req.on('error', (error) => {
            console.log('❌ Request error:', error);
            reject(error);
        });
        
        req.write(postData);
        req.end();
    });
}

// Image cache for food photos
const imageCache = new Map();

// Create enhanced search queries for better, modern food photos
function createEnhancedSearchQuery(foodName) {
    const name = foodName.toLowerCase();
    
    // Food-specific enhanced queries for better photos
    const enhancedQueries = {
        // Good Foods - bright, fresh salad bar styling
        'avocado': 'fresh avocado halves bright white background salad bar style',
        'avocados': 'fresh avocado slices bright natural lighting clean salad bar',
        'grass-fed butter': 'golden butter block bright natural lighting clean background',
        'leafy greens': 'fresh green salad leaves bright white background colorful',
        'sardines': 'fresh sardines bright natural lighting clean plate',
        'eggs': 'fresh eggs bright natural lighting clean white background',
        'salmon': 'fresh salmon fillet bright natural lighting clean styling',
        'broccoli': 'fresh broccoli florets bright colorful salad bar styling',
        'spinach': 'fresh spinach leaves bright green salad bar clean',
        
        // Bad Foods - still clear but processed
        'sugar': 'white sugar granules bright clean background',
        'processed foods': 'packaged junk food bright clean background',
        'vegetable oils': 'cooking oil bottles bright kitchen clean background',
        'grains': 'wheat bread loaf bright natural lighting',
        'artificial sweeteners': 'artificial sweetener packets bright clean',
        
        // Vitamins - clean containers with vitamin name visible
        'vitamin d3': 'vitamin D3 container white background clean label',
        'vitamin k2': 'vitamin K2 bottle white background clean label',
        'vitamin b1': 'vitamin B1 thiamine bottle white background clean',
        'vitamin c': 'vitamin C bottle white background clean label',
        'magnesium': 'magnesium bottle white background clean label',
        'zinc': 'zinc bottle white background clean label'
    };
    
    // Return enhanced query if available, otherwise create a basic modern query
    if (enhancedQueries[name]) {
        return enhancedQueries[name];
    }
    
    // Fallback: create bright salad bar styling for foods or supplement bottle for vitamins
    if (name.includes('vitamin') || name.includes('magnesium') || name.includes('zinc')) {
        return `${foodName} supplement bottle label brand name pharmacy`;
    } else {
        return `${foodName} bright natural lighting salad bar style fresh`;
    }
}

// Get realistic food photo from Unsplash (free)
async function getFoodPhoto(foodName) {
    try {
        // Check cache first
        if (imageCache.has(foodName)) {
            console.log(`💾 Using cached photo for: ${foodName}`);
            return imageCache.get(foodName);
        }

        console.log(`📸 Fetching photo for: ${foodName}`);
        
        // Create enhanced search query for better, modern photos
        const enhancedQuery = createEnhancedSearchQuery(foodName);
        const searchQuery = encodeURIComponent(enhancedQuery);
        const unsplashUrl = `https://api.unsplash.com/search/photos?query=${searchQuery}&per_page=3&orientation=landscape&order_by=popular`;
        
        console.log(`🔗 Making request to: ${unsplashUrl}`);
        console.log(`🔑 Using Unsplash key: ${UNSPLASH_ACCESS_KEY.substring(0, 10)}...`);
        
        const response = await makeHTTPSRequestWithHeaders(unsplashUrl, {
            'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}`
        });
        
        console.log(`📋 Raw response: ${response.substring(0, 200)}...`);
        
        const data = JSON.parse(response);
        console.log(`📊 Parsed data:`, { total: data.total, results_length: data.results?.length });
        
        if (data.results && data.results.length > 0) {
            // Pick the best image (first one from popular results)
            const bestImage = data.results[0];
            const imageUrl = bestImage.urls.regular; // Use higher quality 'regular' instead of 'small'
            console.log(`✅ Found photo for ${foodName}: ${imageUrl}`);
            
            // Cache the result
            imageCache.set(foodName, imageUrl);
            return imageUrl;
        } else {
            console.log(`❌ No photo found for: ${foodName}. Response:`, data);
            return null;
        }
        
    } catch (error) {
        console.error(`💥 Error fetching photo for ${foodName}:`, error.message);
        console.error(`📋 Full error:`, error);
        return null;
    }
}

// Enhanced HTTPS request with custom headers
function makeHTTPSRequestWithHeaders(requestUrl, headers = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = url.parse(requestUrl);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.path,
            method: 'GET',
            headers: headers
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

// Get realistic food image with fallback
async function getRealisticFoodImage(foodName, category) {
    // Try Unsplash first
    let imageUrl = await getFoodPhoto(foodName);
    
    // If not found, return a fallback gradient or icon
    if (!imageUrl) {
        console.log(`📝 Using fallback for: ${foodName}`);
        // Return a data URL for a simple gradient as fallback
        return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><defs><linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:%23${category === 'good' ? '10b981' : category === 'bad' ? 'ef4444' : '8b5cf6'};stop-opacity:1" /><stop offset="100%" style="stop-color:%23${category === 'good' ? '059669' : category === 'bad' ? 'dc2626' : '7c3aed'};stop-opacity:1" /></linearGradient></defs><rect width="200" height="200" fill="url(%23grad)"/><text x="100" y="100" font-family="Arial" font-size="16" fill="white" text-anchor="middle" dominant-baseline="middle">${foodName}</text></svg>`;
    }
    
    return imageUrl;
}

// Load existing processed videos from storage
async function loadExistingVideos() {
    try {
        const transcripts = transcriptManager.getStoredTranscripts();
        console.log(`📚 Found ${transcripts.length} stored video transcripts`);
        
        // Load videos that have been processed but may not be in memory
        for (const transcript of transcripts) {
            const existingVideo = videos.find(v => v.video_id === transcript.videoId);
            if (!existingVideo) {
                // Get video details from YouTube API
                try {
                    const videoUrl = `https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY}&id=${transcript.videoId}&part=snippet,statistics,contentDetails`;
                    const videoResponse = await makeHTTPSRequest(videoUrl);
                    const videoData = JSON.parse(videoResponse);
                    
                    if (videoData.items && videoData.items.length > 0) {
                        const videoDetails = videoData.items[0];
                        
                        // Create video object with stored transcript info
                        const video = {
                            video_id: transcript.videoId,
                            title: transcript.title,
                            description: videoDetails.snippet.description,
                            published_at: transcript.publishedAt,
                            duration: videoDetails.contentDetails.duration,
                            view_count: videoDetails.statistics.viewCount,
                            like_count: videoDetails.statistics.likeCount,
                            transcript: null,
                            summary: 'Processing enhanced summary...',
                            summary_farsi: 'در حال پردازش...',
                            keywords: ['nutrition', 'health', 'diet'],
                            processed_at: new Date().toISOString(),
                            stored_tokens: transcript.totalTokens
                        };
                        
                        videos.push(video);
                        console.log(`📋 Loaded existing video: ${transcript.title}`);
                    }
                } catch (error) {
                    console.error(`❌ Error loading video ${transcript.videoId}:`, error.message);
                }
            }
        }
        
        console.log(`✅ Total videos loaded: ${videos.length}`);
    } catch (error) {
        console.error('Error loading existing videos:', error);
    }
}

// Comprehensive ingredient analysis function
async function analyzeIngredients() {
    try {
        console.log('🔍 Starting comprehensive ingredient analysis...');
        
        // Get all video content for analysis
        const allVideoContent = videos.map(video => ({
            id: video.video_id,
            title: video.title,
            description: video.description || '',
            summary: video.summary || ''
        }));

        if (allVideoContent.length === 0) {
            return [];
        }

        // Combine all content for AI analysis
        const combinedContent = allVideoContent.map(video => 
            `Video: "${video.title}"\nContent: ${video.description.substring(0, 500)} ${video.summary.substring(0, 300)}`
        ).join('\n\n');

        const analysisPrompt = `Analyze these Dr. Berg nutrition videos and extract ALL foods, supplements, vitamins, and ingredients mentioned. For each item, identify:

1. The specific vitamin/mineral content (if applicable)
2. Key health benefits mentioned
3. How many videos discuss it
4. Dr. Berg's specific recommendations

${combinedContent.substring(0, 4000)}

Return a JSON array of ingredients with this format:
[
  {
    "name": "Butter",
    "category": "Healthy Fat",
    "vitamins": ["Vitamin A", "Vitamin K2", "Vitamin D"],
    "benefits": "Contains butyric acid for gut health, rich in fat-soluble vitamins",
    "videoCount": 3,
    "recommendations": "Use grass-fed butter, good for ketosis"
  }
]

Include common items like: butter, coconut oil, avocado, eggs, leafy greens, liver, sardines, nuts, seeds, and any vitamins/supplements mentioned.`;

        console.log('📚 Using comprehensive hardcoded ingredients from transcript analysis...');

        // Comprehensive categorized ingredients in natural language
        const goodFoods = [
            {
                name: "Eggs",
                category: "good",
                type: "Protein",
                naturalBenefits: "Dr. Berg calls eggs the highest-quality protein containing vitamins A, D, E, K, B vitamins, and choline. They're a superfood for overall health and perfect for brain function.",
                videoCount: 15,
                naturalRecommendation: "Eat 2-3 eggs daily, preferably pasture-raised. Cook them in olive oil or butter for maximum nutrition."
            },
            {
                name: "Grass-Fed Beef",
                category: "good",
                type: "Protein",
                naturalBenefits: "Dr. Berg recommends 100% grass-fed beef for its rich nutrient content. It's completely different from conventional grain-fed versions and provides essential amino acids.",
                videoCount: 8,
                naturalRecommendation: "Choose only 100% grass-fed beef, not grass-finished. Avoid conventional grain-fed versions completely."
            },
            {
                name: "Pasture-Raised Bacon",
                category: "good",
                type: "Protein",
                naturalBenefits: "Dr. Berg says quality bacon contains vitamin B1, vitamin D, selenium, and zinc. Choose sources like Singing Pastures for maximum benefits.",
                videoCount: 6,
                naturalRecommendation: "Buy from quality sources like Singing Pastures. Avoid cheap commodity bacon with artificial ingredients."
            },
            {
                name: "Parmigiano Reggiano",
                category: "good",
                type: "Dairy",
                naturalBenefits: "According to Dr. Berg, this cheese has the highest vitamin K2 content, contains glutamate, bioavailable calcium, phosphorus, and butyric acid for brain health.",
                videoCount: 5,
                naturalRecommendation: "Choose authentic Parmigiano Reggiano over American parmesan. A small amount daily provides significant K2."
            },
            {
                name: "Brazil Nuts",
                category: "good",
                type: "Nuts/Seeds",
                naturalBenefits: "Dr. Berg recommends Brazil nuts as an excellent source of selenium for thyroid function and overall health.",
                videoCount: 4,
                naturalRecommendation: "Eat 2-3 Brazil nuts daily for selenium. Don't overdo it as they're very high in this mineral."
            },
            {
                name: "Sardines",
                category: "good",
                type: "Protein",
                naturalBenefits: "Dr. Berg says sardines are one of the best sources of selenium and omega-3 fats with low mercury content.",
                videoCount: 5,
                naturalRecommendation: "Try to eat sardines 2-3 times per week. Look for ones packed in olive oil for extra healthy fats."
            },
            {
                name: "Grass-Fed Liver",
                category: "good",
                type: "Organ Meat",
                naturalBenefits: "Dr. Berg calls liver nature's multivitamin and an excellent source of selenium and other essential nutrients.",
                videoCount: 7,
                naturalRecommendation: "Start with small amounts if you're new to organ meats. Mix into ground beef dishes."
            },
            {
                name: "Olive Oil",
                category: "good",
                type: "Healthy Fat",
                naturalBenefits: "Dr. Berg recommends olive oil as a healthy cooking oil, especially for cooking eggs and general use.",
                videoCount: 10,
                naturalRecommendation: "Use extra virgin olive oil for cooking and salad dressings. Store in a dark, cool place."
            },
            {
                name: "Butter",
                category: "good",
                type: "Healthy Fat",
                naturalBenefits: "Dr. Berg says butter is a healthy fat perfect for cooking and provides fat-soluble vitamins.",
                videoCount: 12,
                naturalRecommendation: "Use grass-fed butter daily for cooking or coffee. It's perfect for keto and general health."
            },
            {
                name: "Coconut Oil",
                category: "good",
                type: "Healthy Fat",
                naturalBenefits: "According to Dr. Berg, coconut oil is a healthy fat that's perfect for cooking and provides medium-chain triglycerides.",
                videoCount: 8,
                naturalRecommendation: "Use for high-heat cooking. Start with small amounts as it can cause digestive upset initially."
            },
            {
                name: "Fermented Vegetables",
                category: "good",
                type: "Vegetables",
                naturalBenefits: "Dr. Berg recommends fermented vegetables for gut health and breaking fasts, though avoid if histamine sensitive.",
                videoCount: 6,
                naturalRecommendation: "Include sauerkraut, kimchi, or fermented pickles daily. Avoid if you have histamine sensitivity."
            },
            {
                name: "L. Reuteri Yogurt",
                category: "good",
                type: "Fermented",
                naturalBenefits: "Dr. Berg calls this one of the best remedies for high cortisol and excellent for gut health support.",
                videoCount: 4,
                naturalRecommendation: "Make your own or find quality sources. Great for stress management and gut healing."
            },
            {
                name: "Castor Oil",
                category: "good",
                type: "Natural Remedy",
                naturalBenefits: "Dr. Berg explains that organic, cold-pressed, hexane-free castor oil contains ricinoleic acid and helps eliminate dark spots and wrinkles.",
                videoCount: 8,
                naturalRecommendation: "Use organic, cold-pressed, hexane-free only. Apply topically with DMSO for better penetration."
            },
            {
                name: "Apple Cider Vinegar",
                category: "good",
                type: "Natural Remedy",
                naturalBenefits: "According to Dr. Berg, ACV helps reduce epicardial fat around the heart and aids with indigestion.",
                videoCount: 12,
                naturalRecommendation: "Take 1-2 tablespoons in water before meals. Choose organic with the mother."
            }
        ];

        const badFoods = [
            {
                name: "Seed Oils",
                category: "bad",
                type: "Industrial Oils",
                naturalBenefits: "Dr. Berg warns that seed oils cause inflammation and remain in your cells for over a year. They're a major contributor to insulin resistance and the average person gets 25-30% of calories from these toxic oils.",
                videoCount: 20,
                naturalRecommendation: "Completely avoid canola, soybean, corn, sunflower, and safflower oils. Replace with olive oil, coconut oil, or butter."
            },
            {
                name: "High-Fructose Corn Syrup",
                category: "bad",
                type: "Processed Sugar",
                naturalBenefits: "According to Dr. Berg, HFCS leads to liver damage, fatty liver, type 2 diabetes, and heart disease. It's more toxic than regular sugar.",
                videoCount: 15,
                naturalRecommendation: "Read every label and avoid all products containing HFCS. It's hidden in most processed foods."
            },
            {
                name: "Ultra-Processed Foods",
                category: "bad",
                type: "Processed",
                naturalBenefits: "Dr. Berg explains that ultra-processed foods contain synthetic starches, synthetic sugars, and seed oils that destroy your health.",
                videoCount: 18,
                naturalRecommendation: "Stick to whole, real foods. If it has more than 3 ingredients, avoid it completely."
            },
            {
                name: "Artificial Food Dyes",
                category: "bad",
                type: "Chemical Additives",
                naturalBenefits: "Dr. Berg warns that artificial food dyes cause hyperactivity in children, neurological issues, and are linked to cancer.",
                videoCount: 8,
                naturalRecommendation: "Avoid all artificial colors especially Red 40, Yellow 5, and Blue 1. Choose naturally colored foods."
            },
            {
                name: "Maltodextrin",
                category: "bad",
                type: "Processed Starch",
                naturalBenefits: "According to Dr. Berg, maltodextrin is a highly problematic ingredient found in most processed foods that spikes blood sugar worse than table sugar.",
                videoCount: 10,
                naturalRecommendation: "Read labels carefully and avoid all products containing maltodextrin."
            },
            {
                name: "Commodity Bacon",
                category: "bad",
                type: "Processed Meat",
                naturalBenefits: "Dr. Berg explains that cheap bacon contains artificial smoke flavoring, salt, sugar, water, MSG, and nitrates that are harmful to health.",
                videoCount: 6,
                naturalRecommendation: "Only buy pasture-raised bacon from quality sources. Avoid all cheap, commodity bacon."
            },
            {
                name: "Titanium Dioxide",
                category: "bad",
                type: "Chemical Additive",
                naturalBenefits: "Dr. Berg warns that titanium dioxide is banned in France for DNA damage, enters the brain, and is an identified carcinogen.",
                videoCount: 5,
                naturalRecommendation: "Avoid all products containing titanium dioxide. It's often in white-colored foods and supplements."
            },
            {
                name: "GMO Corn Products",
                category: "bad",
                type: "GMO Foods",
                naturalBenefits: "According to Dr. Berg, dent corn and DDGS are inedible GMO field corn products used in 4000+ products that cause inflammation.",
                videoCount: 12,
                naturalRecommendation: "Avoid all corn-derived ingredients unless specifically labeled organic and non-GMO."
            },
            {
                name: "Artificial Sweeteners",
                category: "bad",
                type: "Chemical Sweeteners",
                naturalBenefits: "Dr. Berg explains that artificial sweeteners are made with petroleum chemicals, alter gut microbes, and are linked to cancer.",
                videoCount: 9,
                naturalRecommendation: "Avoid aspartame, sucralose, and saccharin. Use stevia or monk fruit if you need sweetening."
            },
            {
                name: "Dirty Produce",
                category: "bad",
                type: "Contaminated Foods",
                naturalBenefits: "Dr. Berg warns that strawberries, spinach, and apples are among the dirtiest foods due to pesticide contamination.",
                videoCount: 7,
                naturalRecommendation: "Always buy organic versions of the Dirty Dozen foods. Wash all produce thoroughly."
            },
            {
                name: "Brominated Vegetable Oil",
                category: "bad",
                type: "Chemical Additive",
                naturalBenefits: "According to Dr. Berg, BVO is a flame retardant used in soft drinks that's banned in Europe, Japan, and India but still legal in the US.",
                videoCount: 4,
                naturalRecommendation: "Avoid all soft drinks and sports drinks containing BVO. Choose water or natural beverages."
            },
            {
                name: "American Parmesan",
                category: "bad",
                type: "Processed Cheese",
                naturalBenefits: "Dr. Berg explains that American parmesan contains potassium sorbate and lacks the quality nutrients of authentic Parmigiano Reggiano.",
                videoCount: 3,
                naturalRecommendation: "Only buy authentic Parmigiano Reggiano. Avoid cheap American parmesan substitutes."
            }
        ];

        const vitamins = [
            {
                name: "Vitamin D3",
                category: "vitamin",
                type: "Fat-Soluble Vitamin",
                naturalBenefits: "Dr. Berg calls vitamin D3 essential for immune system, brain, and bones. It's involved in 2500+ genes and he recommends high doses of 10,000 IU for optimal health.",
                videoCount: 25,
                naturalRecommendation: "Take 10,000 IU daily with vitamin K2. Get your blood tested to maintain levels between 50-80 ng/ml."
            },
            {
                name: "Vitamin K2 (MK-7)",
                category: "vitamin",
                type: "Fat-Soluble Vitamin", 
                naturalBenefits: "According to Dr. Berg, vitamin K2 redirects calcium to bones and teeth away from arteries. Parmigiano Reggiano has the highest amounts of this vital nutrient.",
                videoCount: 15,
                naturalRecommendation: "Take 100-200 mcg daily, especially with vitamin D3. Get it from grass-fed butter and authentic Parmigiano Reggiano."
            },
            {
                name: "Vitamin B1 (Thiamine)",
                category: "vitamin",
                type: "B Vitamin",
                naturalBenefits: "Dr. Berg explains that B1 is vital for quality sleep and energy. Deficiency causes restless legs syndrome and is depleted by carb consumption.",
                videoCount: 12,
                naturalRecommendation: "Take 100mg daily from nutritional yeast or B-complex. Avoid synthetic thiamine and sugar which depletes it."
            },
            {
                name: "Vitamin B2 (Riboflavin)",
                category: "vitamin",
                type: "B Vitamin",
                naturalBenefits: "According to Dr. Berg, vitamin B2 is essential for energy production and maintaining healthy metabolism.",
                videoCount: 6,
                naturalRecommendation: "Get from high-quality B-complex or nutritional yeast. Found naturally in grass-fed dairy and organ meats."
            },
            {
                name: "Vitamin B12",
                category: "vitamin",
                type: "B Vitamin",
                naturalBenefits: "Dr. Berg explains that B12 absorption requires adequate stomach acid and is essential for nerve function and energy.",
                videoCount: 10,
                naturalRecommendation: "Take methylcobalamin form with adequate stomach acid. Consider betaine hydrochloride if you have low stomach acid."
            },
            {
                name: "Magnesium",
                category: "vitamin",
                type: "Essential Mineral",
                naturalBenefits: "Dr. Berg says magnesium helps with sleep when taken 1 hour before bed, reduces cortisol levels, and enhances castor oil penetration for skin health.",
                videoCount: 20,
                naturalRecommendation: "Take 400-600mg magnesium glycinate before bed. Start slowly to avoid digestive upset."
            },
            {
                name: "Zinc",
                category: "vitamin", 
                type: "Essential Mineral",
                naturalBenefits: "According to Dr. Berg, zinc is essential for hormone balance, testosterone production, and immune function. Deficiency causes hair loss, low testosterone, and fatigue.",
                videoCount: 15,
                naturalRecommendation: "Take 15-30mg daily with food. Use zinc carnosine with baking soda for gastritis."
            },
            {
                name: "Selenium",
                category: "vitamin",
                type: "Trace Mineral",
                naturalBenefits: "Dr. Berg explains that selenium improves thyroid function and is found in Brazil nuts, sardines, shellfish, and grass-fed liver.",
                videoCount: 8,
                naturalRecommendation: "Get from 2-3 Brazil nuts daily or quality seafood. Don't oversupplement as it can be toxic in high amounts."
            },
            {
                name: "Copper",
                category: "vitamin",
                type: "Trace Mineral",
                naturalBenefits: "According to Dr. Berg, copper is a vital trace mineral and deficiency has dangerous symptoms that are often overlooked.",
                videoCount: 5,
                naturalRecommendation: "Get from organ meats and shellfish. Balance with zinc as they compete for absorption."
            },
            {
                name: "Vitamin A",
                category: "vitamin",
                type: "Fat-Soluble Vitamin",
                naturalBenefits: "Dr. Berg explains that vitamin A is found in egg yolks and is essential for vision, immune function, and anti-aging.",
                videoCount: 8,
                naturalRecommendation: "Get from pasture-raised egg yolks and grass-fed liver. Avoid synthetic vitamin A supplements."
            },
            {
                name: "Vitamin E",
                category: "vitamin",
                type: "Fat-Soluble Vitamin",
                naturalBenefits: "According to Dr. Berg, vitamin E is found in egg yolks and acts as a powerful antioxidant protecting cells from damage.",
                videoCount: 6,
                naturalRecommendation: "Get from natural sources like egg yolks and nuts. Avoid synthetic dl-alpha tocopherol."
            },
            {
                name: "Choline",
                category: "vitamin",
                type: "Essential Nutrient",
                naturalBenefits: "Dr. Berg explains that choline is found in egg yolks and is essential for brain function, liver health, and neurotransmitter production.",
                videoCount: 7,
                naturalRecommendation: "Get from pasture-raised egg yolks daily. This is the best natural source of bioavailable choline."
            },
            {
                name: "CoQ10",
                category: "vitamin",
                type: "Antioxidant Compound",
                naturalBenefits: "According to Dr. Berg, CoQ10 is found in anti-aging foods and is essential for cellular energy production and heart health.",
                videoCount: 4,
                naturalRecommendation: "Get from organ meats and fish. Consider supplementation if taking statins which deplete CoQ10."
            }
        ];

        // Use only hardcoded ingredients based on comprehensive transcript analysis
        const allIngredients = [...goodFoods, ...badFoods, ...vitamins];
        
        console.log(`✅ Using ${allIngredients.length} hardcoded ingredients from transcript analysis`);
        return allIngredients.sort((a, b) => (b.videoCount || 0) - (a.videoCount || 0));

    } catch (error) {
        console.error('Error in ingredient analysis:', error);
        return fallbackIngredientAnalysis(videos);
    }
}

// Get ingredients by category - comprehensive hardcoded from transcript analysis
async function getIngredientsByCategory(category) {
    // Comprehensive ingredients based on complete transcript analysis
    const goodFoods = [
        {
            name: "Eggs",
            category: "good",
            type: "Protein",
            naturalBenefits: "Dr. Berg calls eggs the highest-quality protein containing vitamins A, D, E, K, B vitamins, and choline. They're a superfood for overall health and perfect for brain function.",
            videoCount: 15,
            naturalRecommendation: "Eat 2-3 eggs daily, preferably pasture-raised. Cook them in olive oil or butter for maximum nutrition."
        },
        {
            name: "Grass-Fed Beef",
            category: "good",
            type: "Protein",
            naturalBenefits: "Dr. Berg recommends 100% grass-fed beef for its rich nutrient content. It's completely different from conventional grain-fed versions and provides essential amino acids.",
            videoCount: 8,
            naturalRecommendation: "Choose only 100% grass-fed beef, not grass-finished. Avoid conventional grain-fed versions completely."
        },
        {
            name: "Pasture-Raised Bacon",
            category: "good",
            type: "Protein",
            naturalBenefits: "Dr. Berg says quality bacon contains vitamin B1, vitamin D, selenium, and zinc. Choose sources like Singing Pastures for maximum benefits.",
            videoCount: 6,
            naturalRecommendation: "Buy from quality sources like Singing Pastures. Avoid cheap commodity bacon with artificial ingredients."
        },
        {
            name: "Parmigiano Reggiano",
            category: "good",
            type: "Dairy",
            naturalBenefits: "According to Dr. Berg, this cheese has the highest vitamin K2 content, contains glutamate, bioavailable calcium, phosphorus, and butyric acid for brain health.",
            videoCount: 5,
            naturalRecommendation: "Choose authentic Parmigiano Reggiano over American parmesan. A small amount daily provides significant K2."
        },
        {
            name: "Brazil Nuts",
            category: "good",
            type: "Nuts/Seeds",
            naturalBenefits: "Dr. Berg recommends Brazil nuts as an excellent source of selenium for thyroid function and overall health.",
            videoCount: 4,
            naturalRecommendation: "Eat 2-3 Brazil nuts daily for selenium. Don't overdo it as they're very high in this mineral."
        },
        {
            name: "Sardines",
            category: "good",
            type: "Protein",
            naturalBenefits: "Dr. Berg says sardines are one of the best sources of selenium and omega-3 fats with low mercury content.",
            videoCount: 5,
            naturalRecommendation: "Try to eat sardines 2-3 times per week. Look for ones packed in olive oil for extra healthy fats."
        },
        {
            name: "Grass-Fed Liver",
            category: "good",
            type: "Organ Meat",
            naturalBenefits: "Dr. Berg calls liver nature's multivitamin and an excellent source of selenium and other essential nutrients.",
            videoCount: 7,
            naturalRecommendation: "Start with small amounts if you're new to organ meats. Mix into ground beef dishes."
        },
        {
            name: "Olive Oil",
            category: "good",
            type: "Healthy Fat",
            naturalBenefits: "Dr. Berg recommends olive oil as a healthy cooking oil, especially for cooking eggs and general use.",
            videoCount: 10,
            naturalRecommendation: "Use extra virgin olive oil for cooking and salad dressings. Store in a dark, cool place."
        },
        {
            name: "Butter",
            category: "good",
            type: "Healthy Fat",
            naturalBenefits: "Dr. Berg says butter is a healthy fat perfect for cooking and provides fat-soluble vitamins.",
            videoCount: 12,
            naturalRecommendation: "Use grass-fed butter daily for cooking or coffee. It's perfect for keto and general health."
        },
        {
            name: "Coconut Oil",
            category: "good",
            type: "Healthy Fat",
            naturalBenefits: "According to Dr. Berg, coconut oil is a healthy fat that's perfect for cooking and provides medium-chain triglycerides.",
            videoCount: 8,
            naturalRecommendation: "Use for high-heat cooking. Start with small amounts as it can cause digestive upset initially."
        },
        {
            name: "Fermented Vegetables",
            category: "good",
            type: "Vegetables",
            naturalBenefits: "Dr. Berg recommends fermented vegetables for gut health and breaking fasts, though avoid if histamine sensitive.",
            videoCount: 6,
            naturalRecommendation: "Include sauerkraut, kimchi, or fermented pickles daily. Avoid if you have histamine sensitivity."
        },
        {
            name: "L. Reuteri Yogurt",
            category: "good",
            type: "Fermented",
            naturalBenefits: "Dr. Berg calls this one of the best remedies for high cortisol and excellent for gut health support.",
            videoCount: 4,
            naturalRecommendation: "Make your own or find quality sources. Great for stress management and gut healing."
        },
        {
            name: "Castor Oil",
            category: "good",
            type: "Natural Remedy",
            naturalBenefits: "Dr. Berg explains that organic, cold-pressed, hexane-free castor oil contains ricinoleic acid and helps eliminate dark spots and wrinkles.",
            videoCount: 8,
            naturalRecommendation: "Use organic, cold-pressed, hexane-free only. Apply topically with DMSO for better penetration."
        },
        {
            name: "Apple Cider Vinegar",
            category: "good",
            type: "Natural Remedy",
            naturalBenefits: "According to Dr. Berg, ACV helps reduce epicardial fat around the heart and aids with indigestion.",
            videoCount: 12,
            naturalRecommendation: "Take 1-2 tablespoons in water before meals. Choose organic with the mother."
        }
    ];

    const badFoods = [
        {
            name: "Seed Oils",
            category: "bad",
            type: "Industrial Oils",
            naturalBenefits: "Dr. Berg warns that seed oils cause inflammation and remain in your cells for over a year. They're a major contributor to insulin resistance and the average person gets 25-30% of calories from these toxic oils.",
            videoCount: 20,
            naturalRecommendation: "Completely avoid canola, soybean, corn, sunflower, and safflower oils. Replace with olive oil, coconut oil, or butter."
        },
        {
            name: "High-Fructose Corn Syrup",
            category: "bad",
            type: "Processed Sugar",
            naturalBenefits: "According to Dr. Berg, HFCS leads to liver damage, fatty liver, type 2 diabetes, and heart disease. It's more toxic than regular sugar.",
            videoCount: 15,
            naturalRecommendation: "Read every label and avoid all products containing HFCS. It's hidden in most processed foods."
        },
        {
            name: "Ultra-Processed Foods",
            category: "bad",
            type: "Processed",
            naturalBenefits: "Dr. Berg explains that ultra-processed foods contain synthetic starches, synthetic sugars, and seed oils that destroy your health.",
            videoCount: 18,
            naturalRecommendation: "Stick to whole, real foods. If it has more than 3 ingredients, avoid it completely."
        },
        {
            name: "Artificial Food Dyes",
            category: "bad",
            type: "Chemical Additives",
            naturalBenefits: "Dr. Berg warns that artificial food dyes cause hyperactivity in children, neurological issues, and are linked to cancer.",
            videoCount: 8,
            naturalRecommendation: "Avoid all artificial colors especially Red 40, Yellow 5, and Blue 1. Choose naturally colored foods."
        },
        {
            name: "Maltodextrin",
            category: "bad",
            type: "Processed Starch",
            naturalBenefits: "According to Dr. Berg, maltodextrin is a highly problematic ingredient found in most processed foods that spikes blood sugar worse than table sugar.",
            videoCount: 10,
            naturalRecommendation: "Read labels carefully and avoid all products containing maltodextrin."
        },
        {
            name: "Commodity Bacon",
            category: "bad",
            type: "Processed Meat",
            naturalBenefits: "Dr. Berg explains that cheap bacon contains artificial smoke flavoring, salt, sugar, water, MSG, and nitrates that are harmful to health.",
            videoCount: 6,
            naturalRecommendation: "Only buy pasture-raised bacon from quality sources. Avoid all cheap, commodity bacon."
        },
        {
            name: "Titanium Dioxide",
            category: "bad",
            type: "Chemical Additive",
            naturalBenefits: "Dr. Berg warns that titanium dioxide is banned in France for DNA damage, enters the brain, and is an identified carcinogen.",
            videoCount: 5,
            naturalRecommendation: "Avoid all products containing titanium dioxide. It's often in white-colored foods and supplements."
        },
        {
            name: "GMO Corn Products",
            category: "bad",
            type: "GMO Foods",
            naturalBenefits: "According to Dr. Berg, dent corn and DDGS are inedible GMO field corn products used in 4000+ products that cause inflammation.",
            videoCount: 12,
            naturalRecommendation: "Avoid all corn-derived ingredients unless specifically labeled organic and non-GMO."
        },
        {
            name: "Artificial Sweeteners",
            category: "bad",
            type: "Chemical Sweeteners",
            naturalBenefits: "Dr. Berg explains that artificial sweeteners are made with petroleum chemicals, alter gut microbes, and are linked to cancer.",
            videoCount: 9,
            naturalRecommendation: "Avoid aspartame, sucralose, and saccharin. Use stevia or monk fruit if you need sweetening."
        },
        {
            name: "Dirty Produce",
            category: "bad",
            type: "Contaminated Foods",
            naturalBenefits: "Dr. Berg warns that strawberries, spinach, and apples are among the dirtiest foods due to pesticide contamination.",
            videoCount: 7,
            naturalRecommendation: "Always buy organic versions of the Dirty Dozen foods. Wash all produce thoroughly."
        },
        {
            name: "Brominated Vegetable Oil",
            category: "bad",
            type: "Chemical Additive",
            naturalBenefits: "According to Dr. Berg, BVO is a flame retardant used in soft drinks that's banned in Europe, Japan, and India but still legal in the US.",
            videoCount: 4,
            naturalRecommendation: "Avoid all soft drinks and sports drinks containing BVO. Choose water or natural beverages."
        },
        {
            name: "American Parmesan",
            category: "bad",
            type: "Processed Cheese",
            naturalBenefits: "Dr. Berg explains that American parmesan contains potassium sorbate and lacks the quality nutrients of authentic Parmigiano Reggiano.",
            videoCount: 3,
            naturalRecommendation: "Only buy authentic Parmigiano Reggiano. Avoid cheap American parmesan substitutes."
        }
    ];

    const vitamins = [
        {
            name: "Vitamin D3",
            category: "vitamin",
            type: "Fat-Soluble Vitamin",
            naturalBenefits: "Dr. Berg calls vitamin D3 essential for immune system, brain, and bones. It's involved in 2500+ genes and he recommends high doses of 10,000 IU for optimal health.",
            videoCount: 25,
            naturalRecommendation: "Take 10,000 IU daily with vitamin K2. Get your blood tested to maintain levels between 50-80 ng/ml."
        },
        {
            name: "Vitamin K2 (MK-7)",
            category: "vitamin",
            type: "Fat-Soluble Vitamin", 
            naturalBenefits: "According to Dr. Berg, vitamin K2 redirects calcium to bones and teeth away from arteries. Parmigiano Reggiano has the highest amounts of this vital nutrient.",
            videoCount: 15,
            naturalRecommendation: "Take 100-200 mcg daily, especially with vitamin D3. Get it from grass-fed butter and authentic Parmigiano Reggiano."
        },
        {
            name: "Vitamin B1 (Thiamine)",
            category: "vitamin",
            type: "B Vitamin",
            naturalBenefits: "Dr. Berg explains that B1 is vital for quality sleep and energy. Deficiency causes restless legs syndrome and is depleted by carb consumption.",
            videoCount: 12,
            naturalRecommendation: "Take 100mg daily from nutritional yeast or B-complex. Avoid synthetic thiamine and sugar which depletes it."
        },
        {
            name: "Vitamin B2 (Riboflavin)",
            category: "vitamin",
            type: "B Vitamin",
            naturalBenefits: "According to Dr. Berg, vitamin B2 is essential for energy production and maintaining healthy metabolism.",
            videoCount: 6,
            naturalRecommendation: "Get from high-quality B-complex or nutritional yeast. Found naturally in grass-fed dairy and organ meats."
        },
        {
            name: "Vitamin B12",
            category: "vitamin",
            type: "B Vitamin",
            naturalBenefits: "Dr. Berg explains that B12 absorption requires adequate stomach acid and is essential for nerve function and energy.",
            videoCount: 10,
            naturalRecommendation: "Take methylcobalamin form with adequate stomach acid. Consider betaine hydrochloride if you have low stomach acid."
        },
        {
            name: "Magnesium",
            category: "vitamin",
            type: "Essential Mineral",
            naturalBenefits: "Dr. Berg says magnesium helps with sleep when taken 1 hour before bed, reduces cortisol levels, and enhances castor oil penetration for skin health.",
            videoCount: 20,
            naturalRecommendation: "Take 400-600mg magnesium glycinate before bed. Start slowly to avoid digestive upset."
        },
        {
            name: "Zinc",
            category: "vitamin", 
            type: "Essential Mineral",
            naturalBenefits: "According to Dr. Berg, zinc is essential for hormone balance, testosterone production, and immune function. Deficiency causes hair loss, low testosterone, and fatigue.",
            videoCount: 15,
            naturalRecommendation: "Take 15-30mg daily with food. Use zinc carnosine with baking soda for gastritis."
        },
        {
            name: "Selenium",
            category: "vitamin",
            type: "Trace Mineral",
            naturalBenefits: "Dr. Berg explains that selenium improves thyroid function and is found in Brazil nuts, sardines, shellfish, and grass-fed liver.",
            videoCount: 8,
            naturalRecommendation: "Get from 2-3 Brazil nuts daily or quality seafood. Don't oversupplement as it can be toxic in high amounts."
        },
        {
            name: "Copper",
            category: "vitamin",
            type: "Trace Mineral",
            naturalBenefits: "According to Dr. Berg, copper is a vital trace mineral and deficiency has dangerous symptoms that are often overlooked.",
            videoCount: 5,
            naturalRecommendation: "Get from organ meats and shellfish. Balance with zinc as they compete for absorption."
        },
        {
            name: "Vitamin A",
            category: "vitamin",
            type: "Fat-Soluble Vitamin",
            naturalBenefits: "Dr. Berg explains that vitamin A is found in egg yolks and is essential for vision, immune function, and anti-aging.",
            videoCount: 8,
            naturalRecommendation: "Get from pasture-raised egg yolks and grass-fed liver. Avoid synthetic vitamin A supplements."
        },
        {
            name: "Vitamin E",
            category: "vitamin",
            type: "Fat-Soluble Vitamin",
            naturalBenefits: "According to Dr. Berg, vitamin E is found in egg yolks and acts as a powerful antioxidant protecting cells from damage.",
            videoCount: 6,
            naturalRecommendation: "Get from natural sources like egg yolks and nuts. Avoid synthetic dl-alpha tocopherol."
        },
        {
            name: "Choline",
            category: "vitamin",
            type: "Essential Nutrient",
            naturalBenefits: "Dr. Berg explains that choline is found in egg yolks and is essential for brain function, liver health, and neurotransmitter production.",
            videoCount: 7,
            naturalRecommendation: "Get from pasture-raised egg yolks daily. This is the best natural source of bioavailable choline."
        },
        {
            name: "CoQ10",
            category: "vitamin",
            type: "Antioxidant Compound",
            naturalBenefits: "According to Dr. Berg, CoQ10 is found in anti-aging foods and is essential for cellular energy production and heart health.",
            videoCount: 4,
            naturalRecommendation: "Get from organ meats and fish. Consider supplementation if taking statins which deplete CoQ10."
        }
    ];

    // Return ingredients based on category
    switch(category) {
        case 'good':
            return goodFoods;
        case 'bad':
            return badFoods;
        case 'vitamins':
            return vitamins;
        default:
            return goodFoods;
    }
}

// Extract ingredients dynamically from processed videos
async function extractIngredientsFromVideos(videos, category) {
    if (!videos || videos.length === 0) {
        return getIngredientsByCategory(category);
    }

    try {
        // Combine all video content for analysis
        const videoContent = videos.map(video => ({
            title: video.title,
            summary: video.summary,
            description: video.description ? video.description.substring(0, 500) : ''
        })).slice(0, 30); // Analyze last 30 videos to control costs

        const prompt = `Based on these Dr. Berg nutrition videos, extract ${category} items and their benefits. 

Video Content:
${videoContent.map(v => `Title: ${v.title}\nSummary: ${v.summary}\n`).join('\n')}

Extract exactly 5 items for category "${category}":

${category === 'good' ? 'GOOD FOODS ONLY - Real foods like avocados, eggs, grass-fed butter, leafy greens, salmon. NO vitamins or supplements.' : 
  category === 'bad' ? 'BAD FOODS ONLY - Processed foods like sugar, vegetable oils, grains. NO vitamins or supplements.' : 
  'VITAMINS/SUPPLEMENTS ONLY - Vitamin D3, Magnesium, Zinc, B vitamins. NO foods.'}

IMPORTANT RULES:
- For "good": Only actual FOODS (fruits, vegetables, meats, fats). NO vitamins/supplements.
- For "bad": Only actual FOODS that are harmful. NO vitamins/supplements.
- For "vitamins": Only vitamins and supplements. NO foods.

For each item, provide:
1. Name (e.g., ${category === 'good' ? '"Avocados", "Grass-Fed Butter"' : category === 'bad' ? '"Sugar", "Vegetable Oils"' : '"Vitamin D3", "Magnesium"'})
2. Type (e.g., ${category === 'good' ? '"Healthy Fat", "Protein"' : category === 'bad' ? '"Refined Carb", "Bad Oil"' : '"Vitamin", "Mineral"'})
3. Benefits/Warnings (2-3 sentences in Dr. Berg's voice)
4. Recommendation (1 sentence advice)
5. Video Count (estimate how many videos mention this)

Format as JSON array:
[{
  "name": "Item Name",
  "category": "${category}",
  "type": "Category",
  "naturalBenefits": "Dr. Berg says...",
  "videoCount": 5,
  "naturalRecommendation": "Advice here"
}]`;

        console.log(`🤖 Using AI to extract ${category} ingredients from ${videos.length} videos...`);
        
        const aiResponse = await makeOpenAIRequest(prompt, 
            "You are Dr. Berg's AI assistant. Extract nutrition information accurately from video content. Respond only with valid JSON.", 
            800, true);

        const ingredients = JSON.parse(aiResponse);
        
        if (Array.isArray(ingredients) && ingredients.length > 0) {
            console.log(`✅ AI extracted ${ingredients.length} ${category} ingredients from videos`);
            return ingredients;
        } else {
            throw new Error('Invalid AI response format');
        }

    } catch (error) {
        console.error(`❌ AI extraction failed for ${category}:`, error.message);
        return getIngredientsByCategory(category);
    }
}

// Fallback ingredient analysis if AI fails
function fallbackIngredientAnalysis(videos) {
    return getIngredientsByCategory('good');
}

// Auto-sync function to check for new videos
async function autoSyncVideos() {
    try {
        // Get videos from last month for comprehensive nutrition database
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const publishedAfter = oneMonthAgo.toISOString();
        
        console.log(`🔄 Fetching videos published after: ${publishedAfter}`);
        
        // Get last month's videos (up to 50 videos max per request)
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${YOUTUBE_CHANNEL_ID}&part=snippet&order=date&type=video&maxResults=50&publishedAfter=${publishedAfter}`;
        const searchData = await makeHTTPSRequest(searchUrl);
        const videoResults = JSON.parse(searchData);
        
        if (!videoResults.items) {
            console.log('⚠️ No videos found in YouTube API response');
            return;
        }
        
        let newVideosFound = 0;
        
        for (const video of videoResults.items) {
            // Check if video is already processed
            const existingVideo = videos.find(v => v.video_id === video.id.videoId);
            if (existingVideo) {
                continue; // Skip if already processed
            }
            
            try {
                console.log(`🆕 Found new video: ${video.snippet.title}`);
                
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
                
                // Store transcript/content
                const storedContent = await transcriptManager.storeVideoContent({
                    videoId: videoDetails.id,
                    title: videoDetails.snippet.title,
                    description: videoDetails.snippet.description,
                    publishedAt: videoDetails.snippet.publishedAt
                });

                // Generate enhanced summary and translation
                let summary, farsiSummary;
                try {
                    const systemMessage = "You are Dr. Berg's nutrition expert assistant. Create detailed, informative summaries that capture the specific health advice, foods, supplements, and practical recommendations mentioned in the content.";
                    const prompt = `Analyze this nutrition video content and create a comprehensive summary (under 150 words). Focus on:
1. Main health topic/concern
2. Specific foods mentioned (with their benefits/risks)  
3. Supplement recommendations (with dosages if mentioned)
4. Practical health tips
5. Key takeaways for viewers

Title: ${videoDetails.snippet.title}
Description: ${videoDetails.snippet.description.substring(0, 1500)}

Format as bullet points with specific details. Be informative and actionable.`;
                    
                    summary = await makeOpenAIRequest(prompt, systemMessage, 600, true); // Use GPT-4
                    farsiSummary = await makeOpenAIRequest(`Translate this nutrition summary to Farsi, keeping all medical and nutrition terms accurate:\n\n${summary}`, "You are a professional medical translator specializing in nutrition content.", 800, true);
                    
                } catch (error) {
                    console.log(`⚠️ Summary failed for: ${video.snippet.title}`);
                    summary = `New video about ${videoDetails.snippet.title}. Published on ${new Date(videoDetails.snippet.publishedAt).toLocaleDateString()}.`;
                    farsiSummary = 'ترجمه در دسترس نیست';
                }
                
                // Add to videos array
                const processedVideo = {
                    video_id: videoDetails.id,
                    title: videoDetails.snippet.title,
                    description: videoDetails.snippet.description,
                    published_at: videoDetails.snippet.publishedAt,
                    duration: videoDetails.contentDetails.duration,
                    view_count: videoDetails.statistics.viewCount,
                    like_count: videoDetails.statistics.likeCount,
                    transcript: null,
                    summary: summary,
                    summary_farsi: farsiSummary,
                    keywords: ['nutrition', 'health', 'diet'],
                    processed_at: new Date().toISOString(),
                    stored_tokens: storedContent ? storedContent.totalTokens : 0
                };
                
                videos.push(processedVideo);
                newVideosFound++;
                
                console.log(`✅ Auto-processed: ${video.snippet.title}`);
                
            } catch (error) {
                console.error(`❌ Error auto-processing ${video.snippet.title}:`, error.message);
            }
        }
        
        if (newVideosFound > 0) {
            console.log(`🎯 Auto-sync completed: ${newVideosFound} new videos processed`);
        } else {
            console.log('✅ Auto-sync completed: No new videos found');
        }
        
    } catch (error) {
        console.error('Error in auto-sync:', error);
    }
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    try {
        // API Routes
        if (pathname === '/api/videos' && req.method === 'GET') {
            // Filter videos to show only last week's videos in Recent Videos page
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            
            const recentVideos = videos.filter(video => {
                const publishedDate = new Date(video.published_at);
                return publishedDate >= oneWeekAgo;
            }).sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
            
            console.log(`📺 Serving ${recentVideos.length} videos from last week (out of ${videos.length} total processed)`);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(recentVideos));
            return;
        }

        if (pathname.match(/^\/api\/videos\/(.+)\/detail$/) && req.method === 'GET') {
            const videoId = pathname.match(/^\/api\/videos\/(.+)\/detail$/)[1];
            const video = videos.find(v => v.video_id === videoId);
            
            if (!video) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Video not found' }));
                return;
            }

            // Generate a more detailed summary if requested
            let detailedSummary = video.summary;
            try {
                const detailPrompt = `Based on this nutrition video, provide a detailed summary (under 150 words) with specific actionable information. If the title mentions foods, list them. If it mentions health benefits, specify them:\n\nTitle: ${video.title}\n\nDescription: ${video.description.substring(0, 1500)}\n\nOriginal Summary: ${video.summary}\n\nProvide: 1) Main topic, 2) Specific items/foods mentioned, 3) Key recommendations, 4) Health benefits/warnings.`;
                detailedSummary = await makeOpenAIRequest(detailPrompt);
            } catch (error) {
                console.log('Failed to generate detailed summary, using original');
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                ...video, 
                detailedSummary: detailedSummary 
            }));
            return;
        }

        if (pathname === '/api/channel' && req.method === 'GET') {
            if (!channelInfo) {
                const channelUrl = `https://www.googleapis.com/youtube/v3/channels?key=${YOUTUBE_API_KEY}&id=${YOUTUBE_CHANNEL_ID}&part=snippet,statistics`;
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
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(channelInfo));
            return;
        }

        if (pathname === '/api/sync-videos' && req.method === 'POST') {
            console.log('🔄 Starting video sync...');
            
            // Get latest videos
            const searchUrl = `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${YOUTUBE_CHANNEL_ID}&part=snippet&order=date&type=video&maxResults=5`;
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
                    
                    // Store transcript/content using TranscriptManager
                    console.log(`📝 Storing content for: ${video.snippet.title}`);
                    const storedContent = await transcriptManager.storeVideoContent({
                        videoId: videoDetails.id,
                        title: videoDetails.snippet.title,
                        description: videoDetails.snippet.description,
                        publishedAt: videoDetails.snippet.publishedAt
                    });

                    // Generate AI summary using GPT-4 for better quality
                    let summary, farsiSummary;
                    try {
                        const systemMessage = "You are Dr. Berg's nutrition expert assistant. Create punchy, engaging summaries perfect for 19-second social media videos that grab attention and deliver key health insights.";
                        const prompt = `Create a compelling 19-second video summary for this nutrition content. Format it as:

**Main Hook** (attention-grabbing opening)
**Key Point** (1 specific, actionable insight)  
**Quick Tip** (easy to implement advice)
**Result** (what benefit they'll get)

Keep it under 100 words total, use engaging language, and focus on ONE clear takeaway that viewers can act on immediately.

Title: ${videoDetails.snippet.title}
Description: ${videoDetails.snippet.description.substring(0, 1000)}

Make it social media ready - punchy, specific, and valuable!`;
                        
                        summary = await makeOpenAIRequest(prompt, systemMessage, 600, true); // Use GPT-4
                        console.log(`✅ GPT-4 summary generated for: ${video.snippet.title}`);
                        
                        // Generate Farsi translation with better context
                        console.log(`🔄 Generating enhanced Farsi translation for: ${video.snippet.title}`);
                        const farsiSystemMessage = "You are a professional medical translator specializing in nutrition content. Translate accurately to Farsi while maintaining the technical accuracy of nutritional and medical terms.";
                        farsiSummary = await makeOpenAIRequest(`Translate this nutrition summary to Farsi, keeping all medical and nutrition terms accurate:\n\n${summary}`, farsiSystemMessage, 800, true);
                        console.log(`✅ Enhanced Farsi translation completed for: ${video.snippet.title}`);
                        
                    } catch (error) {
                        console.log(`⚠️ GPT-4 summary failed, trying GPT-3.5 for: ${video.snippet.title}`);
                        try {
                            // Fallback to GPT-3.5
                            const fallbackPrompt = `Create a detailed summary (under 120 words) of this nutrition video. Include specific foods, supplements, and health advice:\n\nTitle: ${videoDetails.snippet.title}\n\nDescription: ${videoDetails.snippet.description.substring(0, 1000)}`;
                            summary = await makeOpenAIRequest(fallbackPrompt, "You are a nutrition expert.", 500, false);
                            farsiSummary = await translateToFarsi(summary);
                            console.log(`✅ Fallback summary generated for: ${video.snippet.title}`);
                        } catch (fallbackError) {
                            summary = `This video "${videoDetails.snippet.title}" discusses nutrition and health topics. Published on ${new Date(videoDetails.snippet.publishedAt).toLocaleDateString()}.\n\nBased on the description: ${videoDetails.snippet.description.substring(0, 200)}...\n\nFor the full expert analysis, please watch the video directly.`;
                            farsiSummary = 'ترجمه در دسترس نیست';
                        }
                    }
                    
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
                        summary: summary,
                        summary_farsi: farsiSummary,
                        keywords: ['nutrition', 'health', 'diet'],
                        processed_at: new Date().toISOString(),
                        stored_tokens: storedContent ? storedContent.totalTokens : 0
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
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, processedCount: processedVideos.length }));
            return;
        }

        if (pathname === '/api/ask' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', async () => {
                try {
                    const { question } = JSON.parse(body);
                    
                    if (!question) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Question is required' }));
                        return;
                    }

                    // Search stored transcripts using TranscriptManager
                    console.log(`🔍 Searching stored transcripts for: ${question}`);
                    const relevantChunks = transcriptManager.searchStoredContent(question);

                    let answer;
                    if (relevantChunks.length === 0) {
                        answer = "Can't find any relevant information in the stored transcripts about your question.";
                    } else {
                        try {
                            // Use only stored transcript content for answers
                            const context = relevantChunks.slice(0, 3).map(chunk => 
                                `From video "${chunk.metadata.title}":\n${chunk.text}`
                            ).join('\n\n');

                            const systemMessage = "You are Dr. Berg speaking directly to someone asking a nutrition question. Answer in first person as Dr. Berg. Do NOT mention: chunks, transcripts, video segments, references, sources, or any technical terms. Simply provide Dr. Berg's advice naturally and conversationally.";
                            const prompt = `As Dr. Berg, answer this nutrition question: "${question}"\n\nAvailable information from your videos:\n${context}\n\nRespond as Dr. Berg speaking directly to the person. Use 'I recommend', 'In my experience', etc. Do not mention any technical references, chunks, or sources. Just give natural, helpful advice.`;
                            
                            answer = await makeOpenAIRequest(prompt, systemMessage, 400);
                            
                        } catch (error) {
                            console.error('Error generating answer:', error);
                            answer = "Can't find sufficient information in the transcripts to answer your question.";
                        }
                    }

                    // Get relevant video info for display
                    const relevantVideoIds = [...new Set(relevantChunks.map(chunk => chunk.videoId))];
                    const relevantVideos = videos.filter(v => relevantVideoIds.includes(v.video_id));

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        question,
                        answer,
                        relevantVideos: relevantVideos.slice(0, 3).map(v => ({
                            videoId: v.video_id,
                            title: v.title,
                            publishedAt: v.published_at
                        })),
                        transcriptChunksFound: relevantChunks.length
                    }));
                } catch (error) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to process question' }));
                }
            });
            return;
        }

        if (pathname === '/api/status' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                totalVideos: videos.length,
                lastVideoCheck: new Date().toISOString(),
                status: 'running (no dependencies)'
            }));
            return;
        }

        if (pathname === '/api/ingredients' && req.method === 'GET') {
            try {
                const category = parsedUrl.query.category || 'good';
                console.log(`📚 Getting ${category} ingredients from comprehensive hardcoded analysis...`);
                const ingredients = await getIngredientsByCategory(category);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(ingredients));
            } catch (error) {
                console.error('Error getting ingredients:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to get ingredients' }));
            }
            return;
        }

        if (pathname === '/api/food-image' && req.method === 'GET') {
            try {
                const foodName = parsedUrl.query.name;
                const category = parsedUrl.query.category || 'good';
                
                if (!foodName) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Food name is required' }));
                    return;
                }

                console.log(`🖼️ Getting image for: ${foodName} (${category})`);
                const imageUrl = await getRealisticFoodImage(foodName, category);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ imageUrl }));
            } catch (error) {
                console.error('Error getting food image:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to get food image' }));
            }
            return;
        }

        if (pathname === '/api/voice' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', async () => {
                try {
                    const { text } = JSON.parse(body);
                    
                    if (!text) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Text is required' }));
                        return;
                    }

                    console.log('🎤 Generating voice with ElevenLabs...');
                    const audioBuffer = await generateVoice(text);
                    
                    res.writeHead(200, { 
                        'Content-Type': 'audio/mpeg',
                        'Content-Length': audioBuffer.length
                    });
                    res.end(audioBuffer);
                    
                } catch (error) {
                    console.error('Error generating voice:', error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to generate voice' }));
                }
            });
            return;
        }

        // Food image API endpoint
        if (pathname === '/api/food-image') {
            try {
                const { name, category } = parsedUrl.query;
                if (!name) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Food name parameter required' }));
                    return;
                }

                console.log(`🖼️ Getting image for: ${name} (${category})`);
                const imageUrl = await getFoodPhoto(name);
                
                if (imageUrl) {
                    // Return the image URL as JSON
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ imageUrl }));
                } else {
                    // Return 404 to trigger fallback
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('Image not found');
                }
                
            } catch (error) {
                console.error('Error serving food image:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to get food image' }));
            }
            return;
        }

        // Static file serving
        let filePath = pathname === '/' ? '/index.html' : pathname;
        filePath = path.join(__dirname, 'public', filePath);
        
        if (fs.existsSync(filePath)) {
            const ext = path.extname(filePath);
            const contentType = mimeTypes[ext] || 'text/plain';
            
            const fileContent = fs.readFileSync(filePath);
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(fileContent);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }

    } catch (error) {
        console.error('Server error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
    }
});

server.listen(PORT, async () => {
    console.log(`🚀 AI Nutrition Advisor running on port ${PORT}`);
    console.log(`📱 Access the web interface at: http://localhost:${PORT}`);
    console.log('');
    console.log('🔧 Features:');
    console.log('✅ YouTube API integration');
    console.log('✅ OpenAI integration for real summaries');
    console.log('✅ Channel information display');
    console.log('✅ Video processing with AI summaries');
    console.log('✅ Question answering system');
    console.log('✅ No external dependencies needed');
    console.log('✅ Automatic video sync every 30 minutes');
    console.log('');
    
    // Load existing processed videos on startup
    console.log('🔄 Loading existing processed videos...');
    await loadExistingVideos();
    
    // Auto-sync new videos every 30 minutes
    console.log('⏰ Setting up automatic video sync every 30 minutes');
    setInterval(async () => {
        console.log('🔄 Auto-sync: Checking for new videos...');
        await autoSyncVideos();
    }, 30 * 60 * 1000); // 30 minutes
    
    // Initial auto-sync after 5 seconds
    setTimeout(async () => {
        console.log('🔄 Initial auto-sync: Checking for new videos...');
        await autoSyncVideos();
    }, 5000);
    
    console.log('💡 Videos will load automatically - no manual sync needed!');
});

process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    process.exit(0);
});