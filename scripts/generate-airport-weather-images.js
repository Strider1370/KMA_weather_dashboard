"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("GEMINI_API_KEY not found in .env");
  process.exit(1);
}

const MODEL = "gemini-3.1-flash-image-preview";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

const REFERENCE_IMAGE = path.resolve(__dirname, "../제주공항_기준.png");
const OUTPUT_DIR = path.resolve(__dirname, "../frontend/public/airport_weather/RKPC");

const COMMON_PREFIX =
  "Modify only the weather, sky, and lighting of the provided reference image. " +
  "Keep the exact same camera angle, composition, focal length, perspective, " +
  "and all buildings/structures/aircraft/ground equipment unchanged. " +
  "Photorealistic documentary photograph, no wide-angle distortion, " +
  "no artistic stylization, no cinematic exaggeration, no text or watermark.";

const SCENES = [
  // golden (10)
  { key: "golden_clear", prompt: "Change to golden hour with clear skies. Low-angle warm sunlight casting long orange-tinted shadows across the apron. Sky gradient from deep blue overhead to warm orange near the horizon. A few wispy high-altitude clouds tinted pink and gold. Excellent visibility, calm atmosphere, dry pavement with warm reflections." },
  { key: "golden_sct", prompt: "Change to golden hour with scattered clouds. About 30-40% cumulus cloud coverage, clouds lit from below by warm golden-orange sunlight. Gaps of blue sky between clouds. Mixed warm highlights and cool cloud shadows on the apron. Good visibility." },
  { key: "golden_bkn", prompt: "Change to golden hour with broken clouds. About 60-70% cloud coverage, occasional breaks where warm golden light pours through dramatically. Contrast between lit and shaded areas on the ground. Clouds textured with orange and gray tones." },
  { key: "golden_ovc", prompt: "Change to golden hour with full overcast. Thick uniform cloud layer covering the entire sky, tinted with a muted warm glow near the horizon. Flat diffused lighting with no direct sunlight. Dull gray atmosphere with a subtle warm tint at the edges." },
  { key: "golden_fog", prompt: "Change to golden hour with dense fog. Thick ground-level fog reducing visibility to about 200-300 meters. Warm diffused golden light filtering through the fog. Buildings and aircraft fade into the fog with distance. Halos around any visible lights. Moist, hazy atmosphere." },
  { key: "golden_rain", prompt: "Change to golden hour with moderate rain. Overcast sky with a faint warm glow near the horizon. Steady rain falling, wet reflective surfaces on tarmac and apron. Small puddles forming. Slightly reduced visibility. Muted warm tones mixing with gray." },
  { key: "golden_heavy_rain", prompt: "Change to golden hour with heavy rain. Very dark low clouds, intense downpour with visible rain streaks. Standing water and large puddles on all surfaces. Greatly reduced visibility, barely any golden light breaking through. Spray from rain impact visible on the ground." },
  { key: "golden_snow", prompt: "Change to golden hour with moderate snowfall. Overcast sky with a faint warm tint near the horizon. Snowflakes falling gently. Thin layer of snow accumulating on rooftops, grass areas, and taxiway edges. Tarmac wet with melting snow. Slightly reduced visibility." },
  { key: "golden_heavy_snow", prompt: "Change to golden hour with heavy snowfall. Thick dense snowfall severely limiting visibility. Heavy snow accumulation on all surfaces. Barely any warm light visible through the thick snowfall. Near-whiteout conditions. Everything softened and muted by heavy snow." },
  { key: "golden_thunderstorm", prompt: "Change to golden hour with a thunderstorm. Very dark towering cumulonimbus clouds dominating the sky. Heavy rain with a lightning bolt illuminating the clouds in the background. Faint golden glow at the horizon contrasting with the dark storm. Wet surfaces, wind-driven rain." },

  // day (10)
  { key: "day_clear", prompt: "Change to a clear sunny daytime scene. Bright blue sky with minimal clouds. Strong overhead sunlight creating crisp defined shadows on the ground. High visibility, calm conditions, dry clean pavement." },
  { key: "day_sct", prompt: "Change to daytime with scattered clouds. About 30-40% cumulus cloud coverage across a blue sky. Patches of sunlight and shadow alternate on the ground. Good visibility, pleasant atmosphere." },
  { key: "day_bkn", prompt: "Change to daytime with broken clouds. About 60-70% cloud coverage with visible gaps showing blue sky. Diffused sunlight, muted ground shadows. Slightly flat lighting overall but still daytime brightness." },
  { key: "day_ovc", prompt: "Change to a fully overcast daytime scene. Uniform gray cloud layer covering the entire sky. No visible sun, flat shadowless lighting. Slightly desaturated colors, dull heavy atmosphere." },
  { key: "day_fog", prompt: "Change to daytime with dense fog. Thick white-gray fog blanketing the airport, visibility limited to about 200-300 meters. Distant buildings and aircraft barely visible as faint silhouettes. Flat white lighting, no shadows. Everything beyond mid-distance fades away." },
  { key: "day_rain", prompt: "Change to daytime with moderate rain. Gray overcast sky, steady rainfall visible as fine streaks in the air. Wet pavement reflecting the gray sky, small puddles on the ground. Reduced visibility, everything slightly darkened and desaturated." },
  { key: "day_heavy_rain", prompt: "Change to daytime with heavy rain. Very dark gray sky, torrential downpour with dense visible rain streaks. Large puddles and standing water across the tarmac. Very poor visibility, distant objects barely visible. Water spray bouncing off pavement surfaces." },
  { key: "day_snow", prompt: "Change to daytime with moderate snowfall. Gray-white overcast sky, steady snowflakes falling. Thin snow covering on the ground, rooftops, and grassy areas. Pavement wet and slushy. Muted colors, soft diffused white light." },
  { key: "day_heavy_snow", prompt: "Change to daytime with heavy snowfall. Dense thick snowfall with greatly reduced visibility. Heavy white snow blanketing all surfaces — rooftops, tarmac edges, equipment. Near-whiteout conditions, distant structures disappearing into the falling snow." },
  { key: "day_thunderstorm", prompt: "Change to a daytime thunderstorm. Extremely dark menacing cumulonimbus clouds overhead. Heavy rain and a visible lightning strike in the background sky. Very dark atmosphere despite being daytime. Wet surfaces everywhere, wind-swept rain." },

  // night (10)
  { key: "night_clear", prompt: "Change to a clear nighttime scene. Dark deep blue-black sky with visible stars. Airport lit by apron floodlights and runway edge lights. Clean sharp lighting on aircraft and terminal. Cool ambient tones, no clouds, calm dry atmosphere." },
  { key: "night_sct", prompt: "Change to nighttime with scattered clouds. Dark sky partially covered with clouds, some stars visible through gaps. Airport lighting dominant, reflecting faintly off nearby cloud bases. Cool tones with warm artificial light pools." },
  { key: "night_bkn", prompt: "Change to nighttime with broken clouds. Most of the dark sky covered by clouds, very few stars visible. Airport lights glow and reflect off the low cloud base, creating an ambient orange-gray light dome. Moody atmosphere." },
  { key: "night_ovc", prompt: "Change to a fully overcast nighttime scene. Thick cloud layer completely hiding the sky. Airport artificial lights create a diffused orange glow reflected off the low cloud ceiling. No stars, no sky detail. Flat heavy atmosphere." },
  { key: "night_fog", prompt: "Change to nighttime with dense fog. Thick fog with very limited visibility. Airport lights create bright glowing halos and light cones through the fog. Distant objects completely obscured. Eerie muted atmosphere, moist air feel." },
  { key: "night_rain", prompt: "Change to nighttime with moderate rain. Dark overcast sky, rain falling through the beams of airport lights. Wet surfaces reflecting runway lights and apron lighting in long streaks. Puddles on the ground mirroring lights. Active but subdued atmosphere." },
  { key: "night_heavy_rain", prompt: "Change to nighttime with heavy rain. Intense downpour in darkness, rain heavily visible in airport light beams as dense curtains. Flooded surfaces reflecting lights in distorted rippling patterns. Very limited visibility. Spray and mist rising from ground impact." },
  { key: "night_snow", prompt: "Change to nighttime with moderate snowfall. Snowflakes falling through airport light beams, visible as bright white specks against the dark sky. Thin snow layer accumulating on surfaces, wet reflective pavement. Quiet calm winter night atmosphere." },
  { key: "night_heavy_snow", prompt: "Change to nighttime with heavy snowfall. Intense snowfall with large dense flakes filling the airport light beams. Thick snow covering all surfaces. Very low visibility, lights creating bright glowing cones through the dense snow. Heavy muffled winter atmosphere." },
  { key: "night_thunderstorm", prompt: "Change to a nighttime thunderstorm. Pitch-dark sky lit momentarily by a bright lightning bolt illuminating towering storm clouds in the background. Heavy rain, wind-driven spray. Airport lights struggling against the darkness. Wet reflective surfaces everywhere." },
];

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          reject(new Error(`Non-JSON response (${res.statusCode}): ${raw.slice(0, 500)}`));
        }
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function generateImage(imageBase64, mimeType, scenePrompt) {
  const fullPrompt = `${COMMON_PREFIX}\n\n${scenePrompt}`;

  const requestBody = {
    contents: [{
      parts: [
        { text: fullPrompt },
        { inline_data: { mime_type: mimeType, data: imageBase64 } },
      ],
    }],
    generationConfig: {
      responseModalities: ["image", "text"],
    },
  };

  const result = await postJson(API_URL, requestBody);

  if (result.status !== 200) {
    const msg = result.body?.error?.message || JSON.stringify(result.body).slice(0, 300);
    throw new Error(`API ${result.status}: ${msg}`);
  }

  const parts = result.body?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p.inlineData?.mimeType?.startsWith("image/"));

  if (!imagePart) {
    const textPart = parts.find((p) => p.text);
    throw new Error(`No image in response. Text: ${textPart?.text?.slice(0, 200) || "none"}`);
  }

  return Buffer.from(imagePart.inlineData.data, "base64");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!fs.existsSync(REFERENCE_IMAGE)) {
    console.error(`Reference image not found: ${REFERENCE_IMAGE}`);
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const imageBuffer = fs.readFileSync(REFERENCE_IMAGE);
  const imageBase64 = imageBuffer.toString("base64");
  const mimeType = "image/png";

  console.log(`Reference image: ${REFERENCE_IMAGE} (${(imageBuffer.length / 1024).toFixed(0)} KB)`);
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log(`Total scenes: ${SCENES.length}`);
  console.log("");

  // Skip already generated images
  const pending = SCENES.filter((scene) => {
    const outPath = path.join(OUTPUT_DIR, `${scene.key}.png`);
    if (fs.existsSync(outPath)) {
      console.log(`[SKIP] ${scene.key}.png (already exists)`);
      return false;
    }
    return true;
  });

  if (!pending.length) {
    console.log("\nAll images already generated!");
    return;
  }

  console.log(`\nGenerating ${pending.length} images...\n`);

  let success = 0;
  let fail = 0;

  for (let i = 0; i < pending.length; i++) {
    const scene = pending[i];
    const outPath = path.join(OUTPUT_DIR, `${scene.key}.png`);
    const progress = `[${i + 1}/${pending.length}]`;

    try {
      console.log(`${progress} Generating ${scene.key}...`);
      const pngBuffer = await generateImage(imageBase64, mimeType, scene.prompt);
      fs.writeFileSync(outPath, pngBuffer);
      console.log(`${progress} OK -> ${scene.key}.png (${(pngBuffer.length / 1024).toFixed(0)} KB)`);
      success++;
    } catch (error) {
      console.error(`${progress} FAIL ${scene.key}: ${error.message}`);
      fail++;
    }

    // Rate limit: wait between requests
    if (i < pending.length - 1) {
      await sleep(3000);
    }
  }

  console.log(`\nDone! Success: ${success}, Failed: ${fail}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
