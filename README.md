<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/efacb2d8-3a06-422f-a366-7abe28bd2208


 **[角色资产]**，点击某个角色的 **[齿轮/精修]** 按钮，在 **ElevenLabs Voice ID (可选)** 那个输入框里，填入对应的微软音色代码即可。

#### 🎁 微软 Edge TTS 中文优质音色速查表（直接复制填入即可）：

**女声（适合女主、旁白、萝莉、御姐）**：
*   `zh-CN-XiaoxiaoNeural` —— 晓晓（最经典，女声通用，适合旁白）
*   `zh-CN-XiaoyiNeural` —— 晓伊（偏可爱/幼女声线）
*   `zh-CN-XiaomoNeural` —— 晓墨（成熟御姐/大青衣）
*   `zh-CN-XiaoruiNeural` —— 晓睿（知性、稳重女声）
*   `zh-CN-XiaozhenNeural` —— 晓甄（温柔自然女声）

**男声（适合男主、大叔、正太）**：
*   `zh-CN-YunxiNeural` —— 云希（阳光青年，非常像男主音色）
*   `zh-CN-YunjianNeural` —— 云健（成熟稳重的大叔/男配音色）
*   `zh-CN-YunzeNeural` —— 云泽（苍老的老爷爷音色，极度适合反派或老者）
*   `zh-CN-YunyangNeural` —— 云扬（新闻播音腔男声，适合专业解说）

**方言与特殊音色**：
*   `zh-CN-liaoning-XiaobeiNeural` —— 东北话（晓北，非常适合搞笑角色）
*   `zh-CN-shaanxi-XiaoniNeural` —— 陕西话（晓妮）
*   `zh-TW-HsiaoChenNeural` —— 台湾腔（晓臻，非常机车）

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
