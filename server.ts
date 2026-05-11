// server.ts
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 设置 JSON 处理限制，防止大数据传输失败
  app.use(express.json({ limit: '10mb' }));

  // ============================================================================
  // 1. Edge TTS 代理接口
  // ============================================================================
  app.post("/api/tts", async (req, res) => {
    try {
      const { text, voice = "zh-CN-XiaoxiaoNeural" } = req.body;

      if (!text) {
        return res.status(400).json({ error: "文本内容不能为空" });
      }

      const tts = new MsEdgeTTS();
      // 设置音频格式为 MP3 (24kHz, 48kbps)
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      
      // 获取流对象
      const streams = tts.toStream(text);
      
      // 设置响应头为音频格式
      res.setHeader('Content-Type', 'audio/mpeg');
      
      // 核心修复：访问 streams 内部的 audioStream 进行 pipe
      streams.audioStream.pipe(res);

      // 错误处理：监听流错误
      streams.audioStream.on('error', (err) => {
        console.error("TTS Stream Error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "音频流传输失败" });
        }
      });

    } catch (error: any) {
      console.error("TTS API Error:", error);
      res.status(500).json({ error: error.message || "TTS 生成失败" });
    }
  });

  // ============================================================================
  // 2. Vite 静态资源处理
  // ============================================================================
  if (process.env.NODE_ENV !== "production") {
    // 开发模式：使用 Vite 中间件
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // 生产模式：直接托管 dist 目录
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`
  🚀 VoxStudio Server 运行成功!
  ---------------------------------------
  > Local:    http://localhost:${PORT}
  > TTS API:  http://localhost:${PORT}/api/tts
  ---------------------------------------
  `);
  });
}

startServer();
