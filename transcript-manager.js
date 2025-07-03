const fs = require('fs');
const path = require('path');
const https = require('https');

class TranscriptManager {
    constructor() {
        this.storageDir = path.join(__dirname, 'transcript-storage');
        this.indexFile = path.join(this.storageDir, 'index.json');
        this.initializeStorage();
    }

    initializeStorage() {
        // Create storage directory if it doesn't exist
        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }

        // Create index file if it doesn't exist
        if (!fs.existsSync(this.indexFile)) {
            fs.writeFileSync(this.indexFile, JSON.stringify({ videos: [], lastUpdated: new Date().toISOString() }, null, 2));
        }
    }

    getStoredIndex() {
        try {
            const indexData = fs.readFileSync(this.indexFile, 'utf8');
            return JSON.parse(indexData);
        } catch (error) {
            console.error('Error reading index:', error);
            return { videos: [], lastUpdated: new Date().toISOString() };
        }
    }

    saveIndex(index) {
        try {
            index.lastUpdated = new Date().toISOString();
            fs.writeFileSync(this.indexFile, JSON.stringify(index, null, 2));
        } catch (error) {
            console.error('Error saving index:', error);
        }
    }

    getStoredTranscripts() {
        try {
            const index = this.getStoredIndex();
            return index.videos || [];
        } catch (error) {
            console.error('Error getting stored transcripts:', error);
            return [];
        }
    }

    async fetchTranscript(videoId) {
        try {
            // Try to use youtube-transcript package equivalent with HTTPS
            const url = `https://www.youtube.com/watch?v=${videoId}`;
            
            // For now, we'll simulate transcript fetching
            // In a real implementation, you'd use the youtube-transcript package
            console.log(`Attempting to fetch transcript for video: ${videoId}`);
            
            // Since we can't easily get transcripts without dependencies,
            // we'll use the video description as content for now
            return null; // Will be handled by caller
            
        } catch (error) {
            console.error(`Error fetching transcript for ${videoId}:`, error);
            return null;
        }
    }

    tokenizeText(text) {
        // Simple tokenization - split into chunks of ~500 words
        const words = text.split(/\s+/);
        const chunks = [];
        const chunkSize = 500;

        for (let i = 0; i < words.length; i += chunkSize) {
            const chunk = words.slice(i, i + chunkSize).join(' ');
            chunks.push({
                text: chunk,
                wordCount: Math.min(chunkSize, words.length - i),
                startIndex: i,
                endIndex: Math.min(i + chunkSize - 1, words.length - 1)
            });
        }

        return chunks;
    }

    async storeVideoContent(videoData) {
        try {
            const index = this.getStoredIndex();
            
            // Check if already stored
            const existingVideo = index.videos.find(v => v.videoId === videoData.videoId);
            if (existingVideo) {
                console.log(`Video ${videoData.videoId} already stored`);
                return existingVideo;
            }

            // Try to get transcript first
            let content = await this.fetchTranscript(videoData.videoId);
            let contentSource = 'transcript';

            // If no transcript, use title + description
            if (!content) {
                content = `${videoData.title}\n\n${videoData.description}`;
                contentSource = 'metadata';
                console.log(`Using title + description for ${videoData.videoId}`);
            }

            // Tokenize content
            const tokens = this.tokenizeText(content);

            // Create storage entry
            const videoEntry = {
                videoId: videoData.videoId,
                title: videoData.title,
                publishedAt: videoData.publishedAt,
                contentSource: contentSource,
                totalTokens: tokens.length,
                storedAt: new Date().toISOString(),
                fileNames: []
            };

            // Save each token chunk to separate files
            tokens.forEach((token, index) => {
                const fileName = `${videoData.videoId}_chunk_${index}.txt`;
                const filePath = path.join(this.storageDir, fileName);
                
                const tokenData = {
                    videoId: videoData.videoId,
                    chunkIndex: index,
                    text: token.text,
                    wordCount: token.wordCount,
                    metadata: {
                        title: videoData.title,
                        publishedAt: videoData.publishedAt,
                        contentSource: contentSource
                    }
                };

                fs.writeFileSync(filePath, JSON.stringify(tokenData, null, 2));
                videoEntry.fileNames.push(fileName);
            });

            // Update index
            index.videos.push(videoEntry);
            this.saveIndex(index);

            console.log(`✅ Stored ${tokens.length} token chunks for video: ${videoData.title}`);
            return videoEntry;

        } catch (error) {
            console.error('Error storing video content:', error);
            throw error;
        }
    }

    searchStoredContent(query) {
        try {
            const index = this.getStoredIndex();
            const queryWords = query.toLowerCase().split(/\s+/);
            const results = [];

            // Search through all stored token files
            for (const video of index.videos) {
                for (const fileName of video.fileNames) {
                    const filePath = path.join(this.storageDir, fileName);
                    
                    if (fs.existsSync(filePath)) {
                        const tokenData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                        const text = tokenData.text.toLowerCase();
                        
                        // Check if any query words are in this chunk
                        const matchCount = queryWords.filter(word => text.includes(word)).length;
                        
                        if (matchCount > 0) {
                            results.push({
                                ...tokenData,
                                relevanceScore: matchCount / queryWords.length,
                                fileName: fileName
                            });
                        }
                    }
                }
            }

            // Sort by relevance and return top results
            return results
                .sort((a, b) => b.relevanceScore - a.relevanceScore)
                .slice(0, 5); // Top 5 most relevant chunks

        } catch (error) {
            console.error('Error searching stored content:', error);
            return [];
        }
    }

    getStoredVideos() {
        const index = this.getStoredIndex();
        return index.videos;
    }

    getVideoContent(videoId) {
        try {
            const index = this.getStoredIndex();
            const video = index.videos.find(v => v.videoId === videoId);
            
            if (!video) {
                return null;
            }

            // Read all chunks for this video
            const chunks = [];
            for (const fileName of video.fileNames) {
                const filePath = path.join(this.storageDir, fileName);
                if (fs.existsSync(filePath)) {
                    const tokenData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    chunks.push(tokenData);
                }
            }

            // Sort chunks by index
            chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
            
            return {
                video: video,
                chunks: chunks,
                fullText: chunks.map(c => c.text).join(' ')
            };

        } catch (error) {
            console.error('Error getting video content:', error);
            return null;
        }
    }
}

module.exports = TranscriptManager;