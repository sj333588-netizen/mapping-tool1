export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'GROQ_API_KEY not set' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { image } = body;
  if (!image) return { statusCode: 400, body: JSON.stringify({ error: 'No image provided' }) };

  const prompt = `You are a Kumbh Mela field safety inspector writing an OFFICIAL AUDIT REPORT for government authorities. Every finding must be backed by specific visual proof from this exact photo. Be precise — vague answers will fail inspection.

══════════════════════════════════════════
STEP 1 — VISUAL CHECKLIST (answer literally from what you see):
══════════════════════════════════════════
SURFACE: Wet/muddy/dry?
WATER: Actual standing water or puddles visible? (yes/no)
MUD: Actual brown wet mud/soil visible? (yes/no)
RIVER: River/canal/lake/large water body visible? (yes/no)
STAIRS: Actual steps/stairs visible? (yes/no)
ELECTRIC: Dangling/exposed electrical wires visible? (yes/no)
INDOOR: Inside building/covered structure? (yes/no)
PEOPLE: Count every visible human body
VEHICLES: Count every visible vehicle
ENVIRONMENT: road/parking/ghat/market/temple/station/other

══════════════════════════════════════════
STEP 2 — HARD RULES (breaking these = hallucination):
══════════════════════════════════════════
- water=no AND mud=no → slippery/waterlogged/mud = severity:NONE confidence:0
- river=no → ghat/river_edge = severity:NONE confidence:0
- stairs=no → stairs = severity:NONE confidence:0
- electric=no → electric_wire = severity:NONE confidence:0
- electric_wire CRITICAL needs CLEARLY VISIBLE dangling/frayed wire within 5m of pedestrian zone — utility poles with normal wires do NOT count, overhead power lines do NOT count
- indoor=yes → ghat/river_edge/mud/waterlogged = severity:NONE confidence:0
- people<15 → high_crowd_density = severity:NONE confidence:0 (scattered people is NOT crowd density)
- people 15-30 AND visibly packed/touching → high_crowd_density MAX = LOW
- people>30 AND density>2 per sq meter visible → high_crowd_density can be MEDIUM+
- people<50 → stampede_risk = severity:NONE confidence:0
- HIGH CROWD DENSITY means people physically packed together, shoulder-to-shoulder — NOT just "people are present"
- stairs=yes → flag ONLY IF: narrow(<2m wide) AND no railing visible AND people present on them. Stairs alone on empty road = NONE
- CRITICAL needs 95%+ certainty with direct visible proof
- FALSE POSITIVES DESTROY CREDIBILITY — when unsure → NONE

══════════════════════════════════════════
EVIDENCE QUALITY (authorities will verify against photo):
══════════════════════════════════════════
visual_evidence: SPECIFIC description of exactly what you see.
  BAD: "wet surface"  
  GOOD: "Dark wet patch ~2m wide on concrete road near left curb, with visible water sheen, likely drainage overflow"

detected_object: Name the SPECIFIC object (e.g. "yellow metal electrical junction box with hanging wire", "broken iron crowd control barrier", "cracked concrete step with no railing")

pilgrim_impact: HOW this endangers Kumbh pilgrims specifically (e.g. "Barefoot pilgrims on wet mossy stone will slip, especially during pre-dawn bathing processions with poor lighting")

reasoning: Your official inspector judgment — what you see, why severity is this level, what incident could occur.

public_summary: ONE short plain-language sentence a common pilgrim/citizen (not an engineer) can instantly understand — no technical words, no percentages, no jargon.
  BAD: "Slippery surface detected with 78% confidence due to standing water"
  GOOD: "Ground is wet here — watch your step so you don't slip."
  If severity is NONE, public_summary should be "" (empty).

CONFIDENCE → SEVERITY: 0-50%=NONE | 51-65%=LOW | 66-80%=MEDIUM | 81-92%=HIGH | 93-100%=CRITICAL
QUADRANT: Where in the photo is this hazard? Choose: top-left | top-center | top-right | middle-left | middle-center | middle-right | bottom-left | bottom-center | bottom-right. Use 'not-visible' ONLY if severity is NONE.

BBOX (separate section at end of JSON): For each hazard with severity != NONE, provide precise center coordinates as percentage of photo. Only include hazards that are actually detected.
Format: "bboxes": { "hazard_id": [x_pct, y_pct, w_pct, h_pct], ... }
Example: pothole at bottom-center, vehicles at middle-right → "bboxes": {"pothole":[50,80,20,15],"vehicle_pedestrian_conflict":[70,45,35,25]}
x=0 left, x=100 right | y=0 top, y=100 bottom | w/h = size of object in % of photo

MEASUREMENTS: Adult shoulder ~45cm, height ~165cm | Car ~1.8m wide 4m long | Motorcycle ~2m long | Bus ~12m long

IMPORTANT FOR QUANTIFICATION:
- road_width_meters: number only (e.g. 8), use vehicles/people as scale reference
- area_estimate_sqm: number only (e.g. 200), estimate visible ground area
- motion_direction: MUST be exactly one of: unidirectional / bidirectional / stationary / mixed
- footpath_width_meters: number only (e.g. 1.5)
- All example values in JSON below are placeholders — replace with actual observed values

FIXED OBSTACLES (permanent structures that reduce usable walking area):
- Identify any PERMANENT fixed structures standing on the walkable surface itself: statue, pillar, pole, tree trunk, bollard, kiosk, permanent bench, electrical box, well/structure base, monument.
- Do NOT count: parked vehicles (temporary), people, movable carts — only permanent fixed structures.
- For each one found, estimate its footprint area in sqm (small pole ~0.3, tree trunk ~1, statue/pillar ~5-20 depending on size, kiosk ~10-15).
- fixed_obstacles: array of {type, area_sqm} — empty array [] if none visible.

PREDICTED RISK — "WHAT-IF" EVENT SCENARIO (separate from currently-visible hazards — this is about what COULD happen once Kumbh-specific conditions apply, even if nothing is wrong right now):
- This is PART 2 of the audit: imagine this exact location during peak Kumbh event day, not as it looks today.
- Consider ALL of these future-condition categories and evaluate each one against the CURRENT structural characteristics (road width, fixed obstacles, footpath width, intersection type, zone type, existing drainage/lighting/signage clues):
  1. CROWD SURGE — pedestrian volume could be 10-20x today's count. Will this width/layout bottleneck?
  2. BARRICADE NARROWING — temporary crowd-control fencing typically eats 1-1.5m of width per side. Does this location have spare width to absorb that?
  3. RAIN / WATERLOGGING — if it rains during the event, will this surface/drainage situation flood or become slippery, based on current ground material and slope clues?
  4. NIGHT / LOW-LIGHT — bathing processions often happen pre-dawn. If no lighting infrastructure is visible now, this becomes a fall/trip/crowd-crush risk at night.
  5. MEDICAL & EMERGENCY ACCESS — if this path narrows under crowd, could ambulances/medical teams still reach people here?
  6. SANITATION LOAD — near ghats/food zones with no visible waste infrastructure, high footfall can cause garbage/sewage overflow.
  7. VEHICLE-PEDESTRIAN MIX — if vehicles currently share this space, will that become dangerous once pedestrian volume multiplies?
- predicted_risks: array of objects, each: {category: one of "crowd_surge"|"barricade_narrowing"|"rain_waterlogging"|"night_lighting"|"medical_access"|"sanitation_load"|"vehicle_conflict", condition: short human label e.g. "Barricade Narrowing", likelihood: "low"|"medium"|"high", reasoning: one sentence explaining the structural reason, mitigation: one short sentence recommending a specific fix (e.g. "Install temporary flood lighting every 20m before event dates")}.
- Only include a predicted risk if there is a genuine structural reason grounded in what's visible in THIS photo. Do not invent risks with no visual basis. Empty array [] if the location has no structural concerns for future conditions.
- Aim to evaluate multiple categories per photo where relevant — a thorough audit typically finds 1-4 predicted risks per location, not just one.

ADDITIONAL HARD RULES:
- CONSTRUCTION SITE: If you see any of the following — excavated/dug-up road, construction debris, sand/gravel piles, yellow construction barriers, metal barricades, road under repair — then: narrow_path=HIGH, broken_barrier=MEDIUM (minimum), walkability="partial" or "no". Do NOT rate construction sites as LOW/CLEAR.
- POTHOLE: Any visible crack, depression, broken asphalt/concrete = pothole severity MEDIUM minimum. pothole is a real hazard — treat same weight as slippery/waterlogged.
- FOOTPATH: Only say footpath_present="yes" if you can CLEARLY see a raised, paved, dedicated walking path SEPARATE from the vehicle road surface. If you are unsure, say "partial". If road and footpath are at same level with no visible boundary = "no".
- VEHICLE CONFLICT: If both vehicles AND pedestrians are visible sharing the same space with no physical separation = vehicle_conflict severity LOW minimum.
- WATERLOGGED / SLIPPERY — STRICT RULE: Do NOT flag waterlogged or slippery UNLESS you can see actual standing water, puddles, or wet road surface with light reflection. Dark patches, shadows, color variation on dry road, or road texture alone are NOT evidence of waterlogging. If the road surface looks dry with no visible water = waterlogged NONE, slippery NONE. Only flag if water is explicitly and clearly visible.
- PUDDLE COUNT: puddle_count must be 0 unless you can see actual water bodies/puddles. Shadows and dark stains = 0 puddles.

Respond ONLY with this JSON (no markdown, no extra text):
{
  "observations": {
    "surface_wet": false,
    "water_visible": false,
    "mud_visible": false,
    "river_visible": false,
    "stairs_visible": false,
    "electric_wire_visible": false,
    "is_indoor": false,
    "people_count": 0,
    "vehicle_count": 0,
    "environment_type": "road"
  },
  "quantification": {
    "road_width_meters": 8,
    "area_estimate_sqm": 200,
    "intersection_type": "T-junction",
    "footpath_present": "yes",
    "footpath_location": "left",
    "footpath_width_meters": 1.5,
    "footpath_condition": "clear",
    "pedestrian_count": 0,
    "vehicle_count": 0,
    "vehicle_types": [],
    "motion_direction": "bidirectional",
    "pothole_count": 0,
    "puddle_count": 0,
    "puddle_locations": [],
    "zone_type": "commercial|residential|school|hospital|transport|religious|ghat|unknown",
    "locality_clues": "what signboards/shops/objects suggest about this area (e.g. medical shops suggest hospital zone)",
    "signboards_text": [],
    "occlusions": "list any objects blocking camera view, e.g. parked vehicle, tree, crowd",
    "walkability": "yes|no|partial",
    "walkability_reason": "one sentence why it is or isn't ideal for walking",
    "fixed_obstacles": [],
    "predicted_risks": [],
    "yes_no_summary": {
      "waterlogging": "yes|no",
      "bottleneck": "yes|no",
      "crowd_risk": "yes|no",
      "footpath_available": "yes|no",
      "vehicle_conflict": "yes|no",
      "good_lighting": "yes|no",
      "signage_present": "yes|no",
      "obstruction_present": "yes|no"
    }
  },
  "slippery": {"severity":"NONE","confidence":0,"detected_object":"","visual_evidence":"","pilgrim_impact":"","quadrant":"middle-center","location_in_frame":"","reasoning":"","public_summary":""},
  "waterlogged": {"severity":"NONE","confidence":0,"detected_object":"","visual_evidence":"","pilgrim_impact":"","quadrant":"middle-center","location_in_frame":"","reasoning":"","public_summary":""},
  "mud": {"severity":"NONE","confidence":0,"detected_object":"","visual_evidence":"","pilgrim_impact":"","quadrant":"middle-center","location_in_frame":"","reasoning":"","public_summary":""},
  "stampede_risk": {"severity":"NONE","confidence":0,"detected_object":"","visual_evidence":"","pilgrim_impact":"","quadrant":"middle-center","location_in_frame":"","reasoning":"","public_summary":""},
  "high_crowd_density": {"severity":"NONE","confidence":0,"detected_object":"","visual_evidence":"","pilgrim_impact":"","quadrant":"middle-center","location_in_frame":"","reasoning":"","public_summary":""},
  "broken_barrier": {"severity":"NONE","confidence":0,"detected_object":"","visual_evidence":"","pilgrim_impact":"","quadrant":"middle-center","location_in_frame":"","reasoning":"","public_summary":""},
  "electric_wire": {"severity":"NONE","confidence":0,"detected_object":"","visual_evidence":"","pilgrim_impact":"","quadrant":"middle-center","location_in_frame":"","reasoning":"","public_summary":""},
  "narrow_path": {"severity":"NONE","confidence":0,"detected_object":"","visual_evidence":"","pilgrim_impact":"","quadrant":"middle-center","location_in_frame":"","reasoning":"","public_summary":""},
  "bottleneck": {"severity":"NONE","confidence":0,"detected_object":"","visual_evidence":"","pilgrim_impact":"","quadrant":"middle-center","location_in_frame":"","reasoning":"","public_summary":""},
  "stairs": {"severity":"NONE","confidence":0,"detected_object":"","visual_evidence":"","pilgrim_impact":"","quadrant":"middle-center","location_in_frame":"","reasoning":"","public_summary":""},
  "ghat": {"severity":"NONE","confidence":0,"detected_object":"","visual_evidence":"","pilgrim_impact":"","quadrant":"middle-center","location_in_frame":"","reasoning":"","public_summary":""},
  "river_edge": {"severity":"NONE","confidence":0,"detected_object":"","visual_evidence":"","pilgrim_impact":"","quadrant":"middle-center","location_in_frame":"","reasoning":"","public_summary":""},
  "barrier": {"severity":"NONE","confidence":0,"detected_object":"","visual_evidence":"","pilgrim_impact":"","quadrant":"middle-center","location_in_frame":"","reasoning":"","public_summary":""},
  "approaching_road": {"severity":"NONE","confidence":0,"detected_object":"","visual_evidence":"","pilgrim_impact":"","quadrant":"middle-center","location_in_frame":"","reasoning":"","public_summary":""},
  "garbage": {"severity":"NONE","confidence":0,"detected_object":"","visual_evidence":"","pilgrim_impact":"","quadrant":"middle-center","location_in_frame":"","reasoning":"","public_summary":""},
  "pothole": {"severity":"NONE","confidence":0,"detected_object":"","visual_evidence":"","pilgrim_impact":"","quadrant":"middle-center","location_in_frame":"","reasoning":"","public_summary":""},
  "vehicle_pedestrian_conflict": {"severity":"NONE","confidence":0,"detected_object":"","visual_evidence":"","pilgrim_impact":"","quadrant":"middle-center","location_in_frame":"","reasoning":"","public_summary":""},
  "wide_road": {"severity":"NONE","confidence":0,"detected_object":"","visual_evidence":"","pilgrim_impact":"","quadrant":"middle-center","location_in_frame":"","reasoning":"","public_summary":""},
  "tree_canopy": {"severity":"NONE","confidence":0,"detected_object":"","visual_evidence":"","pilgrim_impact":"","quadrant":"middle-center","location_in_frame":"","reasoning":"","public_summary":""},
  "shade": {"severity":"NONE","confidence":0,"detected_object":"","visual_evidence":"","pilgrim_impact":"","quadrant":"middle-center","location_in_frame":"","reasoning":"","public_summary":""},
  "open_space": {"severity":"NONE","confidence":0,"detected_object":"","visual_evidence":"","pilgrim_impact":"","quadrant":"middle-center","location_in_frame":"","reasoning":"","public_summary":""},
  "medical_post": {"severity":"NONE","confidence":0,"detected_object":"","visual_evidence":"","pilgrim_impact":"","quadrant":"middle-center","location_in_frame":"","reasoning":"","public_summary":""},
  "signage": {"severity":"NONE","confidence":0,"detected_object":"","visual_evidence":"","pilgrim_impact":"","quadrant":"middle-center","location_in_frame":"","reasoning":"","public_summary":""},
  "police_presence": {"severity":"NONE","confidence":0,"detected_object":"","visual_evidence":"","pilgrim_impact":"","quadrant":"middle-center","location_in_frame":"","reasoning":"","public_summary":""},
  "scene_summary": "2 sentences: exact location type and overall safety assessment",
  "inspector_note": "one specific actionable directive for authorities",
  "bboxes": {}
}`;

  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 2000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } }
          ]}],
          temperature: 0.1,
          max_tokens: 3000
        })
      });

      const responseText = await response.text();

      if (response.status === 429) {
        return { statusCode: 429, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Rate limit reached. Please wait a few minutes.' }) };
      }

      if (!response.ok) {
        if (attempt < MAX_RETRIES) { await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt)); continue; }
        return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: `Failed: ${responseText}` }) };
      }

      const groqData = JSON.parse(responseText);
      const rawText = groqData?.choices?.[0]?.message?.content || '{}';

      let parsed;
      try { parsed = JSON.parse(rawText); }
      catch(e) {
        const m = rawText.match(/\{[\s\S]*\}/);
        if (!m) { if (attempt < MAX_RETRIES) { await new Promise(r => setTimeout(r, RETRY_DELAY_MS)); continue; } return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Parse failed' }) }; }
        parsed = JSON.parse(m[0]);
      }

      // ── EXTRACT OBSERVATIONS ──
      const obs = parsed.observations || {};
      const surfaceWet      = obs.surface_wet === true;
      const waterVisible    = obs.water_visible === true;
      const mudVisible      = obs.mud_visible === true;
      const riverVisible    = obs.river_visible === true;
      const stairsVisible   = obs.stairs_visible === true;
      const electricVisible = obs.electric_wire_visible === true;
      const isIndoor        = obs.is_indoor === true;
      const peopleCount     = typeof obs.people_count === 'number' ? obs.people_count : (parsed.quantification?.pedestrian_count || 0);

      // ── ENFORCE CONFIDENCE → SEVERITY ──
      const ALL_IDS = ['slippery','waterlogged','mud','stampede_risk','high_crowd_density',
        'broken_barrier','electric_wire','narrow_path','bottleneck','stairs',
        'ghat','river_edge','barrier','approaching_road','garbage','pothole',
        'vehicle_pedestrian_conflict','wide_road','tree_canopy','shade',
        'open_space','medical_post','signage','police_presence'];

      ALL_IDS.forEach(id => {
        if (!parsed[id]) return;
        const conf = parsed[id].confidence || 0;
        let sev;
        if      (conf <= 50) sev = 'NONE';
        else if (conf <= 65) sev = 'LOW';
        else if (conf <= 80) sev = 'MEDIUM';
        else if (conf <= 92) sev = 'HIGH';
        else                 sev = 'CRITICAL';
        parsed[id].severity = sev;
      });

      // ══════════════════════════════════════════════════
      // HARD RULES — physically impossible combinations
      // ══════════════════════════════════════════════════

      // RULE 1: No water/wet → no water hazards
      if (!waterVisible && !surfaceWet) {
        ['waterlogged', 'slippery', 'mud'].forEach(id => {
          if (parsed[id]) { parsed[id].severity = 'NONE'; parsed[id].confidence = 0; }
        });
      } else if (!mudVisible && parsed.mud) {
        parsed.mud.severity = 'NONE'; parsed.mud.confidence = 0;
      }

      // RULE 2: No river → no ghat/river_edge
      if (!riverVisible) {
        ['ghat', 'river_edge'].forEach(id => {
          if (parsed[id]) { parsed[id].severity = 'NONE'; parsed[id].confidence = 0; }
        });
      }

      // RULE 3: No stairs visible → no stairs hazard
      if (!stairsVisible && parsed.stairs) {
        parsed.stairs.severity = 'NONE'; parsed.stairs.confidence = 0;
      }

      // RULE 4: No electric wire visible → no electric hazard
      if (!electricVisible && parsed.electric_wire) {
        parsed.electric_wire.severity = 'NONE'; parsed.electric_wire.confidence = 0;
      }

      // RULE 5: Indoor → impossible outdoor hazards
      if (isIndoor) {
        ['ghat', 'river_edge', 'mud', 'waterlogged', 'slippery'].forEach(id => {
          if (parsed[id]) { parsed[id].severity = 'NONE'; parsed[id].confidence = 0; }
        });
      }

      // RULE 6: People count gates crowd hazards
      // High crowd density = people physically packed, NOT just "some people visible"
      if (peopleCount < 15 && parsed.high_crowd_density) {
        // <15 people scattered = never crowd density
        parsed.high_crowd_density.severity = 'NONE';
        parsed.high_crowd_density.confidence = 0;
      } else if (peopleCount < 30 && parsed.high_crowd_density) {
        // 15-30 people = max LOW
        if (['CRITICAL','HIGH','MEDIUM'].includes(parsed.high_crowd_density.severity)) {
          parsed.high_crowd_density.severity = 'LOW';
          parsed.high_crowd_density.confidence = Math.min(parsed.high_crowd_density.confidence, 60);
        }
      }
      if (peopleCount < 50 && parsed.stampede_risk) {
        parsed.stampede_risk.severity = 'NONE'; parsed.stampede_risk.confidence = 0;
      }

      // RULE 6b: Stairs — only dangerous if narrow + no railing + people present
      // If stairs visible but people_count=0 or road is wide open → downgrade
      if (stairsVisible && parsed.stairs && parsed.stairs.severity !== 'NONE') {
        // Stairs alone on empty/wide road = not a hazard
        if (peopleCount < 3) {
          parsed.stairs.severity = 'NONE';
          parsed.stairs.confidence = 0;
        } else if (['CRITICAL','HIGH'].includes(parsed.stairs.severity) && parsed.stairs.confidence < 85) {
          parsed.stairs.severity = 'MEDIUM';
          parsed.stairs.confidence = Math.min(parsed.stairs.confidence, 75);
        }
      }

      // RULE 7: Bottleneck requires narrow_path AND crowd both flagged
      if (parsed.bottleneck && parsed.bottleneck.severity !== 'NONE') {
        const narrowFlagged = parsed.narrow_path?.severity !== 'NONE';
        const crowdFlagged  = parsed.high_crowd_density?.severity !== 'NONE';
        if (!narrowFlagged || !crowdFlagged) {
          if (['CRITICAL','HIGH'].includes(parsed.bottleneck.severity)) {
            parsed.bottleneck.severity = 'LOW';
            parsed.bottleneck.confidence = Math.min(parsed.bottleneck.confidence, 60);
          }
        }
      }

      // RULE 8: Mass hallucination guard — >5 CRITICALs with conf <95 → downgrade
      const criticalCount = ALL_IDS.filter(id => parsed[id]?.severity === 'CRITICAL').length;
      if (criticalCount > 5) {
        ALL_IDS.forEach(id => {
          if (parsed[id]?.severity === 'CRITICAL' && (parsed[id]?.confidence || 0) < 95) {
            parsed[id].severity = 'HIGH';
            parsed[id].confidence = Math.min(parsed[id].confidence, 88);
          }
        });
      }

      // RULE 9: Inspector note must be grounded in an actual detected hazard.
      // The model sometimes writes a generic free-text "recommendation" (e.g.
      // mentioning litter/cleaning) even when every hazard is NONE — that is a
      // contradiction an auditor will catch. So we rebuild inspector_note
      // deterministically from the highest-severity hazard that actually
      // survived the hard rules above, instead of trusting the model's text.
      const SEV_RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };
      const prettyName = id => id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      let topHazard = null;
      ALL_IDS.forEach(id => {
        const f = parsed[id];
        if (!f || f.severity === 'NONE') return;
        if (!topHazard || SEV_RANK[f.severity] > SEV_RANK[topHazard.severity]) {
          topHazard = { ...f, id };
        }
      });

      if (!topHazard) {
        parsed.inspector_note = 'No hazards detected in this frame — conditions are clear and suitable for pilgrim movement. Continue routine monitoring.';
      } else {
        const impact = topHazard.pilgrim_impact || topHazard.visual_evidence || '';
        const obj = topHazard.detected_object ? ` (${topHazard.detected_object})` : '';
        parsed.inspector_note = `${topHazard.severity} priority — ${prettyName(topHazard.id)}${obj}. ${impact}`.trim();
      }

      // ── YOLO CROSS-VERIFICATION (parallel, non-blocking) ──
      const yoloServiceUrl = process.env.YOLO_SERVICE_URL;
      let yoloPromise = Promise.resolve(null);
      if (yoloServiceUrl && parsed.quantification) {
        try {
          const imgBuffer = Buffer.from(image, 'base64');
          const boundary = '----YOLOBoundary' + Date.now();
          const CRLF = '\r\n';
          const header = Buffer.from(
            `--${boundary}${CRLF}` +
            `Content-Disposition: form-data; name="file"; filename="photo.jpg"${CRLF}` +
            `Content-Type: image/jpeg${CRLF}${CRLF}`
          );
          const footer = Buffer.from(`${CRLF}--${boundary}--${CRLF}`);
          const multipartBody = Buffer.concat([header, imgBuffer, footer]);

          const yoloController = new AbortController();
          const yoloTimeout = setTimeout(() => yoloController.abort(), 4000);

          yoloPromise = fetch(`${yoloServiceUrl}/detect`, {
            method: 'POST',
            headers: {
              'Content-Type': `multipart/form-data; boundary=${boundary}`,
              'Content-Length': multipartBody.length.toString()
            },
            body: multipartBody,
            signal: yoloController.signal
          }).then(async r => {
            clearTimeout(yoloTimeout);
            if (r.ok) return r.json();
            return null;
          }).catch(() => null);
        } catch(e) { /* silent */ }
      }

      const yoloData = await yoloPromise;
      if (yoloData && parsed.quantification) {
        const groqPed = parsed.quantification.pedestrian_count || 0;
        const groqVeh = parsed.quantification.vehicle_count || 0;
        parsed.quantification.pedestrian_count_yolo = yoloData.pedestrian_count_yolo;
        parsed.quantification.vehicle_count_yolo = yoloData.vehicle_count_yolo;
        parsed.quantification.count_verification =
          (Math.abs(groqPed - yoloData.pedestrian_count_yolo) <= 2 &&
           Math.abs(groqVeh - yoloData.vehicle_count_yolo) <= 2)
            ? 'verified' : 'discrepancy';
        parsed.quantification.verification_source = 'YOLOv8n (open-source, self-hosted)';
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(parsed)
      };

    } catch (err) {
      if (attempt < MAX_RETRIES) { await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt)); continue; }
      return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: err.message }) };
    }
  }
}