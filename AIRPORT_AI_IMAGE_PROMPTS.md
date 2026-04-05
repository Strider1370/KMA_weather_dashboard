# Airport Weather Scene AI Image Prompts

기준 이미지(공항 전경 사진)를 제공한 뒤, 아래 프롬프트를 사용하여 날씨/시간대 변형 이미지를 생성합니다.

## 사용법

1. 공항 기준 이미지 1장을 AI 이미지 생성 도구에 함께 제공합니다.
2. 아래 **공통 지침**을 프롬프트 앞에 항상 붙입니다.
3. 각 장면별 프롬프트를 이어 붙여 생성합니다.

## 공통 지침

모든 프롬프트 앞에 다음을 붙입니다:

> **Modify only the weather, sky, and lighting of the provided reference image. Keep the exact same camera angle, composition, focal length, perspective, and all buildings/structures/aircraft/ground equipment unchanged. Photorealistic documentary photograph, no wide-angle distortion, no artistic stylization, no cinematic exaggeration, no text or watermark.**

---

## 파일 네이밍

`{time}_{weather}.png`

시간대 3종: `golden`, `day`, `night`

날씨 10종: `clear`, `sct`, `bkn`, `ovc`, `fog`, `rain`, `heavy_rain`, `snow`, `heavy_snow`, `thunderstorm`

예: `day_clear.png`, `night_rain.png`, `golden_heavy_snow.png`

---

## TAF 코드 매핑

| 카테고리 | 키 | TAF 코드 |
|----------|-----|----------|
| 맑음 | clear | SKC, FEW, NSW |
| 구름조금 | sct | SCT |
| 구름많음 | bkn | BKN |
| 흐림 | ovc | OVC |
| 안개 | fog | FG |
| 비 | rain | RA, DZ, SHRA, -RA, -DZ, -SHRA |
| 강한 비 | heavy_rain | +RA, +SHRA |
| 눈 | snow | SN, SHSN, -SN, -SHSN |
| 강한 눈 | heavy_snow | +SN, +SHSN |
| 뇌우 | thunderstorm | TS, TSRA, +TSRA |

## 시간대 판별

| 시간대 | 조건 |
|--------|------|
| golden | 일출 또는 일몰 전후 약 30분 |
| day | 일출 30분 후 ~ 일몰 30분 전 |
| night | 일몰 30분 후 ~ 일출 30분 전 |

---

## 프롬프트 목록 (30장)

---

### 1. golden_clear

> Change to golden hour with clear skies. Low-angle warm sunlight casting long orange-tinted shadows across the apron. Sky gradient from deep blue overhead to warm orange near the horizon. A few wispy high-altitude clouds tinted pink and gold. Excellent visibility, calm atmosphere, dry pavement with warm reflections.

### 2. golden_sct

> Change to golden hour with scattered clouds. About 30-40% cumulus cloud coverage, clouds lit from below by warm golden-orange sunlight. Gaps of blue sky between clouds. Mixed warm highlights and cool cloud shadows on the apron. Good visibility.

### 3. golden_bkn

> Change to golden hour with broken clouds. About 60-70% cloud coverage, occasional breaks where warm golden light pours through dramatically. Contrast between lit and shaded areas on the ground. Clouds textured with orange and gray tones.

### 4. golden_ovc

> Change to golden hour with full overcast. Thick uniform cloud layer covering the entire sky, tinted with a muted warm glow near the horizon. Flat diffused lighting with no direct sunlight. Dull gray atmosphere with a subtle warm tint at the edges.

### 5. golden_fog

> Change to golden hour with dense fog. Thick ground-level fog reducing visibility to about 200-300 meters. Warm diffused golden light filtering through the fog. Buildings and aircraft fade into the fog with distance. Halos around any visible lights. Moist, hazy atmosphere.

### 6. golden_rain

> Change to golden hour with moderate rain. Overcast sky with a faint warm glow near the horizon. Steady rain falling, wet reflective surfaces on tarmac and apron. Small puddles forming. Slightly reduced visibility. Muted warm tones mixing with gray.

### 7. golden_heavy_rain

> Change to golden hour with heavy rain. Very dark low clouds, intense downpour with visible rain streaks. Standing water and large puddles on all surfaces. Greatly reduced visibility, barely any golden light breaking through. Spray from rain impact visible on the ground.

### 8. golden_snow

> Change to golden hour with moderate snowfall. Overcast sky with a faint warm tint near the horizon. Snowflakes falling gently. Thin layer of snow accumulating on rooftops, grass areas, and taxiway edges. Tarmac wet with melting snow. Slightly reduced visibility.

### 9. golden_heavy_snow

> Change to golden hour with heavy snowfall. Thick dense snowfall severely limiting visibility. Heavy snow accumulation on all surfaces. Barely any warm light visible through the thick snowfall. Near-whiteout conditions. Everything softened and muted by heavy snow.

### 10. golden_thunderstorm

> Change to golden hour with a thunderstorm. Very dark towering cumulonimbus clouds dominating the sky. Heavy rain with a lightning bolt illuminating the clouds in the background. Faint golden glow at the horizon contrasting with the dark storm. Wet surfaces, wind-driven rain.

---

### 11. day_clear

> Change to a clear sunny daytime scene. Bright blue sky with minimal clouds. Strong overhead sunlight creating crisp defined shadows on the ground. High visibility, calm conditions, dry clean pavement.

### 12. day_sct

> Change to daytime with scattered clouds. About 30-40% cumulus cloud coverage across a blue sky. Patches of sunlight and shadow alternate on the ground. Good visibility, pleasant atmosphere.

### 13. day_bkn

> Change to daytime with broken clouds. About 60-70% cloud coverage with visible gaps showing blue sky. Diffused sunlight, muted ground shadows. Slightly flat lighting overall but still daytime brightness.

### 14. day_ovc

> Change to a fully overcast daytime scene. Uniform gray cloud layer covering the entire sky. No visible sun, flat shadowless lighting. Slightly desaturated colors, dull heavy atmosphere.

### 15. day_fog

> Change to daytime with dense fog. Thick white-gray fog blanketing the airport, visibility limited to about 200-300 meters. Distant buildings and aircraft barely visible as faint silhouettes. Flat white lighting, no shadows. Everything beyond mid-distance fades away.

### 16. day_rain

> Change to daytime with moderate rain. Gray overcast sky, steady rainfall visible as fine streaks in the air. Wet pavement reflecting the gray sky, small puddles on the ground. Reduced visibility, everything slightly darkened and desaturated.

### 17. day_heavy_rain

> Change to daytime with heavy rain. Very dark gray sky, torrential downpour with dense visible rain streaks. Large puddles and standing water across the tarmac. Very poor visibility, distant objects barely visible. Water spray bouncing off pavement surfaces.

### 18. day_snow

> Change to daytime with moderate snowfall. Gray-white overcast sky, steady snowflakes falling. Thin snow covering on the ground, rooftops, and grassy areas. Pavement wet and slushy. Muted colors, soft diffused white light.

### 19. day_heavy_snow

> Change to daytime with heavy snowfall. Dense thick snowfall with greatly reduced visibility. Heavy white snow blanketing all surfaces — rooftops, tarmac edges, equipment. Near-whiteout conditions, distant structures disappearing into the falling snow.

### 20. day_thunderstorm

> Change to a daytime thunderstorm. Extremely dark menacing cumulonimbus clouds overhead. Heavy rain and a visible lightning strike in the background sky. Very dark atmosphere despite being daytime. Wet surfaces everywhere, wind-swept rain.

---

### 21. night_clear

> Change to a clear nighttime scene. Dark deep blue-black sky with visible stars. Airport lit by apron floodlights and runway edge lights. Clean sharp lighting on aircraft and terminal. Cool ambient tones, no clouds, calm dry atmosphere.

### 22. night_sct

> Change to nighttime with scattered clouds. Dark sky partially covered with clouds, some stars visible through gaps. Airport lighting dominant, reflecting faintly off nearby cloud bases. Cool tones with warm artificial light pools.

### 23. night_bkn

> Change to nighttime with broken clouds. Most of the dark sky covered by clouds, very few stars visible. Airport lights glow and reflect off the low cloud base, creating an ambient orange-gray light dome. Moody atmosphere.

### 24. night_ovc

> Change to a fully overcast nighttime scene. Thick cloud layer completely hiding the sky. Airport artificial lights create a diffused orange glow reflected off the low cloud ceiling. No stars, no sky detail. Flat heavy atmosphere.

### 25. night_fog

> Change to nighttime with dense fog. Thick fog with very limited visibility. Airport lights create bright glowing halos and light cones through the fog. Distant objects completely obscured. Eerie muted atmosphere, moist air feel.

### 26. night_rain

> Change to nighttime with moderate rain. Dark overcast sky, rain falling through the beams of airport lights. Wet surfaces reflecting runway lights and apron lighting in long streaks. Puddles on the ground mirroring lights. Active but subdued atmosphere.

### 27. night_heavy_rain

> Change to nighttime with heavy rain. Intense downpour in darkness, rain heavily visible in airport light beams as dense curtains. Flooded surfaces reflecting lights in distorted rippling patterns. Very limited visibility. Spray and mist rising from ground impact.

### 28. night_snow

> Change to nighttime with moderate snowfall. Snowflakes falling through airport light beams, visible as bright white specks against the dark sky. Thin snow layer accumulating on surfaces, wet reflective pavement. Quiet calm winter night atmosphere.

### 29. night_heavy_snow

> Change to nighttime with heavy snowfall. Intense snowfall with large dense flakes filling the airport light beams. Thick snow covering all surfaces. Very low visibility, lights creating bright glowing cones through the dense snow. Heavy muffled winter atmosphere.

### 30. night_thunderstorm

> Change to a nighttime thunderstorm. Pitch-dark sky lit momentarily by a bright lightning bolt illuminating towering storm clouds in the background. Heavy rain, wind-driven spray. Airport lights struggling against the darkness. Wet reflective surfaces everywhere.

---

## 생성 팁

- 기준 이미지 품질이 결과를 좌우합니다. 가능하면 고해상도 원본을 사용하세요.
- 비 장면은 "비가 보이는 것"보다 **젖은 지면과 반사**가 더 실사처럼 보입니다.
- 안개 장면은 전체를 흰색으로 날리지 말고 **원경만 서서히 사라지게** 하는 것이 현실적입니다.
- 천둥번개는 번개를 과장하지 말고 **원거리 배경에 제한적으로** 넣어야 자연스럽습니다.
- 밤 장면은 조명 bloom을 과하게 넣지 않는 것이 중요합니다.
- 눈 장면은 지면 적설 + 공중 눈발을 같이 표현해야 설득력이 있습니다.
