import * as THREE from "three";
		import { OrbitControls } from "three/addons/controls/OrbitControls.js";
		import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
		import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
		import { GUI } from "three/addons/libs/lil-gui.module.min.js";
		import Stats from "three/addons/libs/stats.module.js";

		const gsap = window.gsap;
		const ScrollTrigger = window.ScrollTrigger;
		const SplitText = window.SplitText;
		if (window.gsap && SplitText) {
			window.gsap.registerPlugin(SplitText);
		}
		const queryParams = new URLSearchParams(window.location.search);
		const DEBUG_MODE = queryParams.has("debug") || queryParams.has("debug3d");
		const isSmallScreen = window.matchMedia("(max-width: 768px)").matches;
		const PERFORMANCE = {
			maxPixelRatio: isSmallScreen ? 1.2 : 1.5,
			shadowMapSize: isSmallScreen ? 1024 : 1536,
			grassCount: isSmallScreen ? 9000 : 18000,
			visualEpsilon: 0.0005
		};

		const sceneSection = document.querySelector(".three-scene-section");
		const container = document.getElementById("app");
		const scrollStage = document.getElementById("scroll-stage");
		const storyOverlay = document.getElementById("story-overlay");
		const storySections = storyOverlay
			? Array.from(storyOverlay.querySelectorAll(".story-section"))
			: [];
		const storyWordTracks = [];
		const BASE_SCROLL_STAGE_HEIGHT_VH = 420;
		const EXTRA_POST_REVEAL_SCROLL_VH = 200;
		const SCROLL_STAGE_HEIGHT_VH = BASE_SCROLL_STAGE_HEIGHT_VH + EXTRA_POST_REVEAL_SCROLL_VH;
		const SCROLL_SEQUENCE_PROGRESS_PORTION = BASE_SCROLL_STAGE_HEIGHT_VH / SCROLL_STAGE_HEIGHT_VH;
		const INITIAL_CAMERA_POSE = {
			position: [8.5, 1.2, -10],
			target: [0, 1.2, 0]
		};

		function enforceScrollablePage() {
			if (sceneSection) {
				sceneSection.style.setProperty("--scroll-stage-height", `${SCROLL_STAGE_HEIGHT_VH}vh`);
				sceneSection.style.setProperty("min-height", `${SCROLL_STAGE_HEIGHT_VH}vh`);
			}
			if (scrollStage) {
				scrollStage.style.height = `${SCROLL_STAGE_HEIGHT_VH}vh`;
			}

			const smooth = window.BURNER_SMOOTH_SCROLL?.instance;
			if (smooth && typeof smooth.resize === "function") {
				smooth.resize();
			}
		}

		function splitWordsFallback(element) {
			if (!element) {
				return [];
			}

			const source = (element.textContent || "").trim();
			if (!source) {
				return [];
			}

			const words = source.split(/\s+/);
			const fragment = document.createDocumentFragment();
			const nodes = [];

			for (let i = 0; i < words.length; i++) {
				const mask = document.createElement("span");
				mask.className = "story-word-mask";

				const span = document.createElement("span");
				span.className = "story-word";
				span.textContent = words[i];
				mask.appendChild(span);
				fragment.appendChild(mask);
				nodes.push(span);

				if (i < words.length - 1) {
					fragment.appendChild(document.createTextNode(" "));
				}
			}

			element.textContent = "";
			element.appendChild(fragment);
			return nodes;
		}

		function ensureStoryWordMasks(words) {
			const normalizedWords = Array.isArray(words) ? words : [];
			for (let i = 0; i < normalizedWords.length; i++) {
				const word = normalizedWords[i];
				if (!word) {
					continue;
				}

				const parent = word.parentElement;
				if (parent && parent.classList.contains("story-word-mask")) {
					continue;
				}

				const mask = document.createElement("span");
				mask.className = "story-word-mask";
				word.parentNode?.insertBefore(mask, word);
				mask.appendChild(word);
			}

			return normalizedWords;
		}

		function setupStorySplitText() {
			storyWordTracks.length = 0;
			const canUseSplitText = Boolean(SplitText && typeof SplitText.create === "function");

			for (let i = 0; i < storySections.length; i++) {
				const section = storySections[i];
				const heading = section.querySelector("h2");
				const body = section.querySelector("p");
				const cta = section.querySelector(".story-cta");
				const words = [];
				const splitSafely = (element) => {
					if (!element) {
						return [];
					}

					const source = (element.textContent || "").trim();
					if (!source) {
						return [];
					}

					if (canUseSplitText) {
						try {
							const split = SplitText.create(element, {
								type: "words",
								wordsClass: "story-word"
							});
							if (Array.isArray(split?.words) && split.words.length > 0) {
								return ensureStoryWordMasks(split.words);
							}
						} catch (error) {
							console.warn("SplitText failed for story overlay; using fallback.", error);
						}
					}

					element.textContent = source;
					return splitWordsFallback(element);
				};

				words.push(...splitSafely(heading));
				words.push(...splitSafely(body));

				for (let j = 0; j < words.length; j++) {
					words[j].style.opacity = "0";
					words[j].style.transform = "translate3d(0, 115%, 0)";
					words[j].style.filter = "none";
				}

				if (body) {
					body.style.opacity = "0";
					body.style.transform = "translateY(16px)";
					body.style.letterSpacing = "0.03em";
				}

				if (cta) {
					cta.style.opacity = "0";
					cta.style.transform = "translateY(18px)";
				}

				storyWordTracks.push({
					section,
					words,
					body,
					cta,
					lastOpacity: 0
				});
			}
		}

		enforceScrollablePage();
		setupStorySplitText();

		const scene = new THREE.Scene();
		const environmentFog = {
			color: 0xffffff,
			density: 0.01
		};
		scene.fog = new THREE.FogExp2(environmentFog.color, environmentFog.density);
		const textureLoader = new THREE.TextureLoader();
		const clock = new THREE.Clock();

		const camera = new THREE.PerspectiveCamera(
			55,
			window.innerWidth / window.innerHeight,
			0.1,
			500
		);
		const LOCKED_CAMERA_Y = 1.2;

		const renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, PERFORMANCE.maxPixelRatio));
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1;
		container.appendChild(renderer.domElement);

		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.07;
		controls.enablePan = false;
		controls.enableZoom = false;
		controls.minPolarAngle = Math.PI / 2;
		controls.maxPolarAngle = Math.PI / 2;
		controls.minDistance = 10;
		controls.maxDistance = 15;
		controls.zoomSpeed = 1.25;
		controls.domElement.style.touchAction = "pan-y";

		renderer.domElement.addEventListener("wheel", (event) => {
			if (event.defaultPrevented && !event.ctrlKey) {
				window.scrollBy({ top: event.deltaY, left: 0, behavior: "auto" });
			}
		}, { passive: true });

		function enforceLockedCameraY() {
			camera.position.y = LOCKED_CAMERA_Y;
			controls.target.y = LOCKED_CAMERA_Y;
		}

		enforceLockedCameraY();

		const ambient = new THREE.AmbientLight(0xffffff, 0.35);
		scene.add(ambient);

		const keyLight = new THREE.DirectionalLight(0xffffff, 1.3);
		keyLight.position.set(7, 12, 5);
		keyLight.castShadow = true;
		keyLight.shadow.mapSize.set(PERFORMANCE.shadowMapSize, PERFORMANCE.shadowMapSize);
		keyLight.shadow.camera.near = 0.5;
		keyLight.shadow.camera.far = 80;
		keyLight.shadow.camera.left = -20;
		keyLight.shadow.camera.right = 20;
		keyLight.shadow.camera.top = 20;
		keyLight.shadow.camera.bottom = -20;
		scene.add(keyLight);

		const DISSOLVE_SNOISE_GLSL = `
vec4 permute(vec4 x) {
	return mod(((x * 34.0) + 1.0) * x, 289.0);
}
vec4 taylorInvSqrt(vec4 r) {
	return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v) {
	const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
	const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

	vec3 i = floor(v + dot(v, C.yyy));
	vec3 x0 = v - i + dot(i, C.xxx);

	vec3 g = step(x0.yzx, x0.xyz);
	vec3 l = 1.0 - g;
	vec3 i1 = min(g.xyz, l.zxy);
	vec3 i2 = max(g.xyz, l.zxy);

	vec3 x1 = x0 - i1 + 1.0 * C.xxx;
	vec3 x2 = x0 - i2 + 2.0 * C.xxx;
	vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

	i = mod(i, 289.0);
	vec4 p = permute(permute(permute(
					i.z + vec4(0.0, i1.z, i2.z, 1.0))
					+ i.y + vec4(0.0, i1.y, i2.y, 1.0))
				+ i.x + vec4(0.0, i1.x, i2.x, 1.0));

	float n_ = 1.0 / 7.0;
	vec3 ns = n_ * D.wyz - D.xzx;

	vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

	vec4 x_ = floor(j * ns.z);
	vec4 y_ = floor(j - 7.0 * x_);

	vec4 x = x_ * ns.x + ns.yyyy;
	vec4 y = y_ * ns.x + ns.yyyy;
	vec4 h = 1.0 - abs(x) - abs(y);

	vec4 b0 = vec4(x.xy, y.xy);
	vec4 b1 = vec4(x.zw, y.zw);

	vec4 s0 = floor(b0) * 2.0 + 1.0;
	vec4 s1 = floor(b1) * 2.0 + 1.0;
	vec4 sh = -step(h, vec4(0.0));

	vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
	vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

	vec3 p0 = vec3(a0.xy, h.x);
	vec3 p1 = vec3(a0.zw, h.y);
	vec3 p2 = vec3(a1.xy, h.z);
	vec3 p3 = vec3(a1.zw, h.w);

	vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
	p0 *= norm.x;
	p1 *= norm.y;
	p2 *= norm.z;
	p3 *= norm.w;

	vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
	m = m * m;
	return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1),
				dot(p2, x2), dot(p3, x3)));
}
`;

		function createFluffyGrassMaterial() {
			const uniforms = {
				uTime: { value: 0 },
				uEnableShadows: { value: 1 },
				uShadowDarkness: { value: 0.5 },
				uGrassLightIntensity: { value: 1.0 },
				uNoiseScale: { value: 1.5 },
				uWindDirection: { value: new THREE.Vector2(1, 0.35).normalize() },
				uWindAmp: { value: 0.28 },
				uWindFreq: { value: 9.5 },
				uWindSpeed: { value: 0.85 },
				uWindNoiseScale: { value: 0.85 },
				uWindNoiseSpeed: { value: 0.015 },
				uWindGustAmp: { value: 0.14 },
				uVacateEnabled: { value: 0 },
				uVacateRectCenter: { value: new THREE.Vector2() },
				uVacateRectSize: { value: new THREE.Vector2() },
				uVacateSoftness: { value: 3.0 },
				baseColor: { value: new THREE.Color("#313f1b") },
				tipColor1: { value: new THREE.Color("#9bd38d") },
				tipColor2: { value: new THREE.Color("#1f352a") },
				noiseTexture: { value: new THREE.Texture() },
				grassAlphaTexture: { value: new THREE.Texture() }
			};

			const material = new THREE.MeshLambertMaterial({
				side: THREE.DoubleSide,
				color: 0x229944,
				transparent: true,
				alphaTest: 0.1,
				shadowSide: THREE.BackSide
			});

			material.onBeforeCompile = (shader) => {
				shader.uniforms = {
					...shader.uniforms,
					uTime: uniforms.uTime,
					uWindDirection: uniforms.uWindDirection,
					uWindAmp: uniforms.uWindAmp,
					uWindFreq: uniforms.uWindFreq,
					uWindSpeed: uniforms.uWindSpeed,
					uWindNoiseScale: uniforms.uWindNoiseScale,
					uWindNoiseSpeed: uniforms.uWindNoiseSpeed,
					uWindGustAmp: uniforms.uWindGustAmp,
					uTipColor1: uniforms.tipColor1,
					uTipColor2: uniforms.tipColor2,
					uBaseColor: uniforms.baseColor,
					uEnableShadows: uniforms.uEnableShadows,
					uShadowDarkness: uniforms.uShadowDarkness,
					uGrassLightIntensity: uniforms.uGrassLightIntensity,
					uNoiseScale: uniforms.uNoiseScale,
					uVacateEnabled: uniforms.uVacateEnabled,
					uVacateRectCenter: uniforms.uVacateRectCenter,
					uVacateRectSize: uniforms.uVacateRectSize,
					uVacateSoftness: uniforms.uVacateSoftness,
					uNoiseTexture: uniforms.noiseTexture,
					uGrassAlphaTexture: uniforms.grassAlphaTexture
				};

				shader.vertexShader = `
      #include <common>
      #include <fog_pars_vertex>
      #include <shadowmap_pars_vertex>
      uniform sampler2D uNoiseTexture;
      uniform float uNoiseScale;
      uniform float uTime;
	uniform vec2 uWindDirection;
	uniform float uWindAmp;
	uniform float uWindFreq;
	uniform float uWindSpeed;
	uniform float uWindNoiseScale;
	uniform float uWindNoiseSpeed;
	uniform float uWindGustAmp;

      varying vec2 vGlobalUV;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec2 vWindColor;
	varying vec2 vInstanceXZ;

      void main() {
        #include <color_vertex>
        #include <begin_vertex>
        #include <project_vertex>
        #include <fog_vertex>

        #include <beginnormal_vertex>
        #include <defaultnormal_vertex>
        #include <worldpos_vertex>
        #include <shadowmap_vertex>

        vec2 windDirection = normalize(uWindDirection);
        vec4 modelPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
		vec4 instanceOriginLocal = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
		vInstanceXZ = instanceOriginLocal.xz;

        float terrainSize = 100.0;
        vGlobalUV = (terrainSize - vec2(modelPosition.xz)) / terrainSize;

		float tipBend = pow(clamp(uv.y, 0.0, 1.0), 1.9);
		vec2 gustUv = vGlobalUV * uWindNoiseScale + windDirection * (uTime * uWindNoiseSpeed);
		float gustA = texture2D(uNoiseTexture, gustUv).r;
		float gustB = texture2D(uNoiseTexture, gustUv * 0.47 + vec2(9.1, 3.7)).r;
		float gustEnvelope = smoothstep(0.2, 0.9, mix(gustA, gustB, 0.5));
		float gust = uWindGustAmp * gustEnvelope;

		vec2 crossWindDirection = vec2(-windDirection.y, windDirection.x);
		float bladePhase = dot(vInstanceXZ, vec2(0.31, 0.23));
		float alongPhase = dot(windDirection, vGlobalUV) * uWindFreq + bladePhase;
		float crossPhase = dot(crossWindDirection, vGlobalUV) * (uWindFreq * 0.52) - bladePhase * 0.45;

		float primaryWave = sin(alongPhase + uTime * uWindSpeed);
		float secondaryWave = sin(alongPhase * 0.58 + uTime * (uWindSpeed * 0.64) + 1.7);
		float crossWave = sin(crossPhase + uTime * (uWindSpeed * 0.5) + 0.9);
		float swayAmount = (primaryWave * 0.56 + secondaryWave * 0.29 + crossWave * 0.15) * (uWindAmp + gust) * tipBend;
		float flutter = sin(alongPhase * 1.9 + uTime * (uWindSpeed * 1.35) + gustA * 1.2) * (uWindAmp * 0.045) * pow(tipBend, 1.25);

		float xDisp = windDirection.x * swayAmount + crossWindDirection.x * flutter;
		float zDisp = windDirection.y * swayAmount + crossWindDirection.y * flutter;
        modelPosition.x += xDisp;
        modelPosition.z += zDisp;

		float liftNoise = texture2D(uNoiseTexture, vGlobalUV * (uNoiseScale * 0.75) + uTime * 0.008).r;
		float lift = (0.03 + gustEnvelope * 0.06) * abs(swayAmount) + (liftNoise - 0.5) * 0.02;
		modelPosition.y += lift * tipBend;

        vec4 viewPosition = viewMatrix * modelPosition;
        vec4 projectedPosition = projectionMatrix * viewPosition;
        gl_Position = projectedPosition;

        vUv = vec2(uv.x, 1.0 - uv.y);
        vNormal = normalize(normalMatrix * normal);
        vWindColor = vec2(xDisp, zDisp);
				vViewPosition = viewPosition.xyz;
      }
      `;

				shader.fragmentShader = `
      #include <alphatest_pars_fragment>
      #include <alphamap_pars_fragment>
      #include <fog_pars_fragment>

      #include <common>
      #include <packing>
      #include <lights_pars_begin>
      #include <shadowmap_pars_fragment>
      #include <shadowmask_pars_fragment>

      uniform vec3 uBaseColor;
      uniform vec3 uTipColor1;
      uniform vec3 uTipColor2;
      uniform sampler2D uGrassAlphaTexture;
      uniform sampler2D uNoiseTexture;
      uniform float uNoiseScale;
      uniform int uEnableShadows;
      uniform float uGrassLightIntensity;
      uniform float uShadowDarkness;
	uniform int uVacateEnabled;
	uniform vec2 uVacateRectCenter;
	uniform vec2 uVacateRectSize;
	uniform float uVacateSoftness;

      varying vec2 vUv;
      varying vec2 vGlobalUV;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
	varying vec2 vInstanceXZ;

      void main() {
        vec4 grassAlpha = texture2D(uGrassAlphaTexture, vUv);
        vec4 grassVariation = texture2D(uNoiseTexture, vGlobalUV * uNoiseScale);
        vec3 tipColor = mix(uTipColor1, uTipColor2, grassVariation.r);

				float vacateMask = 1.0;
				if (uVacateEnabled == 1) {
					vec2 halfSize = max(uVacateRectSize * 0.5, vec2(0.0));
					vec2 d = abs(vInstanceXZ - uVacateRectCenter) - halfSize;
					float outsideDist = length(max(d, 0.0));
					float insideDist = min(max(d.x, d.y), 0.0);
					float signedDist = outsideDist + insideDist;
					float softness = max(uVacateSoftness, 0.001);
					vacateMask = smoothstep(-softness, softness, signedDist);
				}

				float grassVisibility = grassAlpha.r * vacateMask;

				vec4 diffuseColor = vec4(mix(uBaseColor, tipColor, vUv.y), grassVisibility);
        vec3 grassFinalColor = diffuseColor.rgb * uGrassLightIntensity;

        vec3 geometryNormal = vNormal;
        vec3 geometryViewDir = (isOrthographic) ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
        vec3 geometryClearcoatNormal;
        IncidentLight directLight;
        float shadow = 0.0;
        float currentShadow = 0.0;
        float NdotL;

        if (uEnableShadows == 1) {
          #if ( NUM_DIR_LIGHTS > 0 )
            DirectionalLight directionalLight;
            #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
              DirectionalLightShadow directionalLightShadow;
            #endif
            #pragma unroll_loop_start
            for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
              directionalLight = directionalLights[i];
              getDirectionalLightInfo(directionalLight, directLight);
              directionalLightShadow = directionalLightShadows[i];
              currentShadow = getShadow(
                directionalShadowMap[i],
                directionalLightShadow.shadowMapSize,
                directionalLightShadow.shadowBias,
                directionalLightShadow.shadowRadius,
                vDirectionalShadowCoord[i]
              );
              currentShadow = all(bvec2(directLight.visible, receiveShadow)) ? currentShadow : 1.0;
              float weight = clamp(pow(length(vDirectionalShadowCoord[i].xy * 2.0 - 1.0), 4.0), 0.0, 1.0);
              shadow += mix(currentShadow, 1.0, weight);
            }
            #pragma unroll_loop_end
          #endif
          grassFinalColor = mix(grassFinalColor, grassFinalColor * uShadowDarkness, 1.0 - shadow);
        }

        diffuseColor.rgb = clamp(diffuseColor.rgb * shadow, 0.0, 1.0);

        #include <alphatest_fragment>
        gl_FragColor = vec4(grassFinalColor, 1.0);

        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
      `;
			};

			return {
				material,
				uniforms,
				update(timeSeconds) {
					uniforms.uTime.value = timeSeconds;
				},
				setVacateRect(rect) {
					uniforms.uVacateEnabled.value = rect && rect.enabled ? 1 : 0;
					uniforms.uVacateRectCenter.value.set(rect?.centerX ?? 0, rect?.centerZ ?? 0);
					uniforms.uVacateRectSize.value.set(
						Math.max(0, rect?.width ?? 0),
						Math.max(0, rect?.depth ?? 0)
					);
				},
				setupTextures(grassAlphaTexture, noiseTexture) {
					uniforms.grassAlphaTexture.value = grassAlphaTexture;
					uniforms.noiseTexture.value = noiseTexture;
					material.needsUpdate = true;
				}
			};
		}

		const grassMaterial = createFluffyGrassMaterial();
		const grassConfig = {
			count: PERFORMANCE.grassCount,
			terrainRadius: isSmallScreen ? 23 : 50,
			innerClearRadius: 0
		};
		const HARDCODED_GRASS_STRAND_LENGTH = 0.2;
		const HARDCODED_GRASS_PLANE_Y = -0.9;
		const worldScrollGroup = new THREE.Group();
		scene.add(worldScrollGroup);
		const grassSystemGroup = new THREE.Group();
		grassSystemGroup.position.y = HARDCODED_GRASS_PLANE_Y;
		worldScrollGroup.add(grassSystemGroup);
		let grassTerrainMesh = null;
		let grassBladeGeometry = null;
		let grassInstancedMesh = null;
		const grassInstanceCache = {
			positions: [],
			quaternions: [],
			scales: []
		};
		const grassVacateRectTarget = {
			enabled: true,
			centerX: 0,
			centerZ: 0,
			width: 16,
			depth: 12
		};
		const grassVacateRect = {
			enabled: false,
			centerX: grassVacateRectTarget.centerX,
			centerZ: grassVacateRectTarget.centerZ,
			width: 0,
			depth: 0
		};
		const HOUSE_DISSOLVE_PROGRESS_START = -0.2;
		const HOUSE_DISSOLVE_PROGRESS_END = 1.2;
		const houseDissolveUniformData = {
			uEdgeColor: { value: new THREE.Color(0xffffff) },
			uFreq: { value: 0.14 },
			uAmp: { value: 0.08 },
			uProgress: { value: HOUSE_DISSOLVE_PROGRESS_START },
			uEdge: { value: 0.08 },
			uEdgeIntensity: { value: 0.95 },
			uYMin: { value: 0.0 },
			uYMax: { value: 1.0 }
		};
		const scrollSequence = {
			progress: 0,
			rotationProgress: 0,
			environmentTurns: 1.5,
			constantSpinRadPerSec: 0.06,
			constantRotationY: 0,
			vacateStart: 0.05,
			vacateEnd: 0.5,
			revealStart: 0.45,
			revealEnd: 0.95
		};
		const firstSectionIntroReveal = {
			hasStarted: false,
			delayMs: 2000,
			durationMs: 900,
			gate: 0,
			timerId: null,
			tween: null
		};
		let lastVisualProgress = Number.NaN;
		let lastIntroGate = Number.NaN;
		let scrollTriggerInstance = null;
		let isGrassReady = false;
		let isHouseReady = false;
		const patchedHouseMaterials = [];
		const houseShadowMeshes = [];
		let houseShadowsEnabled = false;
		const GRASS_STRAND_HEIGHT_MULTIPLIER = 0.2;

		function applyGrassStrandLength(lengthFactor) {
			if (!grassInstancedMesh || grassInstanceCache.scales.length === 0) {
				return;
			}

			const clampedLength = THREE.MathUtils.clamp(lengthFactor, 0.01, 0.2);
			const matrix = new THREE.Matrix4();
			const scaled = new THREE.Vector3();

			for (let i = 0; i < grassInstanceCache.scales.length; i++) {
				const baseScale = grassInstanceCache.scales[i];
				scaled.set(
					baseScale.x,
					baseScale.y * clampedLength * GRASS_STRAND_HEIGHT_MULTIPLIER,
					baseScale.z
				);
				matrix.compose(
					grassInstanceCache.positions[i],
					grassInstanceCache.quaternions[i],
					scaled
				);
				grassInstancedMesh.setMatrixAt(i, matrix);
			}

			grassInstancedMesh.instanceMatrix.needsUpdate = true;
		}

		function createFallbackGrassGeometry() {
			const geometry = new THREE.PlaneGeometry(0.18, 1.2, 1, 4);
			geometry.translate(0, 0.6, 0);
			return geometry;
		}

		function getTerrainHeight(x, z) {
			const broadUndulation = Math.sin(x * 0.22) * Math.cos(z * 0.26) * 0.24;
			const mediumUndulation = Math.sin(x * 0.57 + z * 0.31) * 0.08;
			const microUndulation = Math.cos(z * 0.91 - x * 0.44) * 0.04;
			return broadUndulation + mediumUndulation + microUndulation;
		}

		function getTerrainNormal(x, z, target) {
			const dHx =
				(0.24 * 0.22) * Math.cos(x * 0.22) * Math.cos(z * 0.26) +
				(0.08 * 0.57) * Math.cos(x * 0.57 + z * 0.31) +
				(0.04 * 0.44) * Math.sin(z * 0.91 - x * 0.44);

			const dHz =
				-(0.24 * 0.26) * Math.sin(x * 0.22) * Math.sin(z * 0.26) +
				(0.08 * 0.31) * Math.cos(x * 0.57 + z * 0.31) -
				(0.04 * 0.91) * Math.sin(z * 0.91 - x * 0.44);

			target.set(-dHx, 1, -dHz).normalize();
			return target;
		}

		function isPointInsideVacateRect(x, z, rect) {
			if (!rect || !rect.enabled) {
				return false;
			}

			const halfWidth = Math.max(0, rect.width) * 0.5;
			const halfDepth = Math.max(0, rect.depth) * 0.5;

			return (
				Math.abs(x - rect.centerX) <= halfWidth &&
				Math.abs(z - rect.centerZ) <= halfDepth
			);
		}

		function applyVacateRectTargetNow() {
			grassVacateRect.enabled = grassVacateRectTarget.enabled;
			grassVacateRect.centerX = grassVacateRectTarget.centerX;
			grassVacateRect.centerZ = grassVacateRectTarget.centerZ;
			grassVacateRect.width = grassVacateRectTarget.width;
			grassVacateRect.depth = grassVacateRectTarget.depth;
		}

		function syncVacateRectToShader() {
			grassMaterial.setVacateRect(grassVacateRect);
		}

		function setupUniforms(shader, uniforms) {
			const keys = Object.keys(uniforms);
			for (let i = 0; i < keys.length; i++) {
				const key = keys[i];
				shader.uniforms[key] = uniforms[key];
			}
		}

		function setupHouseDissolveShader(shader) {
			shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
        varying vec3 vPos;
				varying vec3 vWorldPos;
      `);

			shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
        vPos = position;
				vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
      `);

			shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
        varying vec3 vPos;
				varying vec3 vWorldPos;

        uniform float uFreq;
        uniform float uAmp;
        uniform float uProgress;
        uniform float uEdge;
        uniform vec3 uEdgeColor;
				uniform float uEdgeIntensity;
				uniform float uYMin;
				uniform float uYMax;

        ${DISSOLVE_SNOISE_GLSL}
      `);

			shader.fragmentShader = shader.fragmentShader.replace("#include <dithering_fragment>", `#include <dithering_fragment>

				float heightNorm = clamp((vWorldPos.y - uYMin) / max(uYMax - uYMin, 0.0001), 0.0, 1.0);
				float noise = snoise(vPos * uFreq) * uAmp;
				float dissolveField = heightNorm + noise;

				if (dissolveField > uProgress) discard;

				float edgeStart = uProgress - uEdge;

				if (dissolveField > edgeStart && dissolveField <= uProgress) {
					gl_FragColor = vec4(vec3(uEdgeColor) * uEdgeIntensity, 1.0);
        } else {
          gl_FragColor = vec4(gl_FragColor.xyz, 1.0);
        }
      `);
		}

		function patchHouseDissolveMaterial(material) {
			if (!material || material.userData.houseDissolvePatched) {
				return;
			}

			const previousOnBeforeCompile = material.onBeforeCompile;

			material.onBeforeCompile = (shader, renderer) => {
				if (typeof previousOnBeforeCompile === "function") {
					previousOnBeforeCompile.call(material, shader, renderer);
				}
				setupUniforms(shader, houseDissolveUniformData);
				setupHouseDissolveShader(shader);
			};

			material.userData.houseDissolvePatched = true;
			material.needsUpdate = true;
			patchedHouseMaterials.push(material);
		}

		function collectHouseDissolveMaterials(root) {
			const seenMaterials = new Set();
			patchedHouseMaterials.length = 0;

			root.traverse((obj) => {
				if (!obj.isMesh) {
					return;
				}

				const materials = Array.isArray(obj.material)
					? obj.material
					: [obj.material];

				for (const material of materials) {
					if (!material || seenMaterials.has(material)) {
						continue;
					}
					seenMaterials.add(material);
					patchHouseDissolveMaterial(material);
				}
			});
		}

		function setHouseDissolveProgress(progress) {
			const minProgress = Math.min(
				HOUSE_DISSOLVE_PROGRESS_START,
				HOUSE_DISSOLVE_PROGRESS_END
			);
			const maxProgress = Math.max(
				HOUSE_DISSOLVE_PROGRESS_START,
				HOUSE_DISSOLVE_PROGRESS_END
			);

			houseDissolveUniformData.uProgress.value = THREE.MathUtils.clamp(
				progress,
				minProgress,
				maxProgress
			);
		}

		function updateHouseDissolveBounds() {
			if (!houseModel) {
				return;
			}

			const bounds = new THREE.Box3().setFromObject(houseModel);
			houseDissolveUniformData.uYMin.value = bounds.min.y;
			houseDissolveUniformData.uYMax.value = bounds.max.y;
		}

		function setHouseShadowEnabled(enabled) {
			if (houseShadowsEnabled === enabled) {
				return;
			}

			houseShadowsEnabled = enabled;
			for (let i = 0; i < houseShadowMeshes.length; i++) {
				houseShadowMeshes[i].castShadow = enabled;
			}
		}

		function normalizedScrollProgress(progress, start, end) {
			if (end <= start) {
				return progress >= end ? 1 : 0;
			}
			return THREE.MathUtils.clamp((progress - start) / (end - start), 0, 1);
		}

		function smoothstep01(value) {
			const t = THREE.MathUtils.clamp(value, 0, 1);
			return t * t * (3 - 2 * t);
		}

		function expoOut01(value) {
			const t = THREE.MathUtils.clamp(value, 0, 1);
			if (t >= 1) {
				return 1;
			}
			return 1 - Math.pow(2, -10 * t);
		}

		function startFirstSectionIntroReveal() {
			if (firstSectionIntroReveal.hasStarted) {
				return;
			}

			firstSectionIntroReveal.hasStarted = true;
			firstSectionIntroReveal.gate = 0;

			if (firstSectionIntroReveal.timerId !== null) {
				window.clearTimeout(firstSectionIntroReveal.timerId);
				firstSectionIntroReveal.timerId = null;
			}

			if (firstSectionIntroReveal.tween && typeof firstSectionIntroReveal.tween.kill === "function") {
				firstSectionIntroReveal.tween.kill();
				firstSectionIntroReveal.tween = null;
			}

			const delayMs = Math.max(firstSectionIntroReveal.delayMs, 0);
			const durationSec = Math.max(firstSectionIntroReveal.durationMs, 1) / 1000;

			if (gsap && typeof gsap.to === "function") {
				firstSectionIntroReveal.tween = gsap.to(firstSectionIntroReveal, {
					gate: 1,
					delay: delayMs / 1000,
					duration: durationSec,
					ease: "expo.out",
					overwrite: true,
					onComplete: () => {
						firstSectionIntroReveal.tween = null;
					}
				});
				return;
			}

			firstSectionIntroReveal.timerId = window.setTimeout(() => {
				firstSectionIntroReveal.gate = 1;
				firstSectionIntroReveal.timerId = null;
			}, delayMs);
		}

		function updateStoryOverlay(progress) {
			if (storySections.length === 0) {
				return;
			}

			const p = THREE.MathUtils.clamp(progress, 0, 1);
			const steps = Math.max(storySections.length - 1, 1);
			const fadeWindow = (1 / steps) * 0.72;
			const introActiveThreshold = storySections.length > 1 ? 0.5 / steps : 1;
			const firstSectionIntroGate = firstSectionIntroReveal.hasStarted
				? firstSectionIntroReveal.gate
				: 0;
			if (storyOverlay) {
				storyOverlay.classList.toggle("intro-active", p <= introActiveThreshold);
			}

			for (let i = 0; i < storySections.length; i++) {
				const section = storySections[i];
				const track = storyWordTracks[i];
				const center = storySections.length === 1 ? 0 : i / steps;
				const distance = Math.abs(p - center);
				const raw = 1 - distance / Math.max(fadeWindow, 0.0001);
				let opacity = smoothstep01(raw);
				if (i === 0) {
					opacity *= firstSectionIntroGate;
				}
				const previousOpacity = track?.lastOpacity ?? 0;
				const isDormant =
					opacity < PERFORMANCE.visualEpsilon &&
					previousOpacity < PERFORMANCE.visualEpsilon;
				if (isDormant) {
					continue;
				}
				const sectionY = (1 - opacity) * 20;

				section.style.opacity = `${opacity}`;
				section.style.transform = `translateY(${sectionY}px)`;
				section.style.filter = "none";

				if (track?.body) {
					const bodyReveal = smoothstep01((opacity - 0.12) / 0.88);
					const bodyOpacity = opacity * (0.62 + 0.38 * bodyReveal);
					const bodyY = (1 - bodyReveal) * 16 + (1 - opacity) * 6;
					const bodyTracking = 0.03 - bodyReveal * 0.02;

					track.body.style.opacity = `${bodyOpacity}`;
					track.body.style.transform = `translateY(${bodyY}px)`;
					track.body.style.letterSpacing = `${bodyTracking}em`;
				}

				if (track?.cta) {
					const ctaReveal = smoothstep01((opacity - 0.2) / 0.8);
					const ctaOpacity = opacity * ctaReveal;
					const ctaY = (1 - ctaReveal) * 18 + (1 - opacity) * 6;

					track.cta.style.opacity = `${ctaOpacity}`;
					track.cta.style.transform = `translateY(${ctaY}px)`;
				}

				if (!track || track.words.length === 0) {
					continue;
				}

				const revealSpan = 0.44;
				const totalWords = Math.max(track.words.length, 1);
				const sequenceHeadroom = 4;
				const revealCursor = opacity * (totalWords + sequenceHeadroom);

				for (let j = 0; j < track.words.length; j++) {
					const word = track.words[j];
					const delayed = THREE.MathUtils.clamp(
						(revealCursor - j) / Math.max(revealSpan, 0.0001),
						0,
						1
					);
					const wordProgress = expoOut01(delayed);
					const wordOpacity = opacity * wordProgress;
					const wordYPercent = (1 - wordProgress) * 115;

					word.style.opacity = `${wordOpacity}`;
					word.style.transform = `translate3d(0, ${wordYPercent}%, 0)`;
					word.style.filter = "none";
				}

				if (track) {
					track.lastOpacity = opacity;
				}
			}
		}

		function applyScrollVisualState(scrollProgress) {
			const p = THREE.MathUtils.clamp(scrollProgress, 0, 1);
			updateStoryOverlay(p);

			const vacateT = normalizedScrollProgress(
				p,
				scrollSequence.vacateStart,
				scrollSequence.vacateEnd
			);
			grassVacateRect.enabled = grassVacateRectTarget.enabled && vacateT > 0;
			grassVacateRect.centerX = grassVacateRectTarget.centerX;
			grassVacateRect.centerZ = grassVacateRectTarget.centerZ;
			grassVacateRect.width = grassVacateRectTarget.width * vacateT;
			grassVacateRect.depth = grassVacateRectTarget.depth * vacateT;
			syncVacateRectToShader();

			const revealT = normalizedScrollProgress(
				p,
				scrollSequence.revealStart,
				scrollSequence.revealEnd
			);
			setHouseShadowEnabled(p >= scrollSequence.revealStart);
			const dissolveProgress = THREE.MathUtils.lerp(
				HOUSE_DISSOLVE_PROGRESS_START,
				HOUSE_DISSOLVE_PROGRESS_END,
				revealT
			);
			setHouseDissolveProgress(dissolveProgress);
		}

		function applyWorldRotation(rotationProgress = scrollSequence.rotationProgress) {
			const rotationP = THREE.MathUtils.clamp(
				typeof rotationProgress === "number" ? rotationProgress : 0,
				0,
				1
			);

			const scrollRotationY = rotationP * Math.PI * 2 * scrollSequence.environmentTurns;
			const rotationY = scrollRotationY + scrollSequence.constantRotationY;
			worldScrollGroup.rotation.y = rotationY;
			if (scene.environmentRotation) {
				scene.environmentRotation.y = rotationY;
			}
			if (scene.backgroundRotation) {
				scene.backgroundRotation.y = rotationY;
			}
		}

		function applyScrollSequenceProgress(scrollProgress, rotationProgress = scrollSequence.rotationProgress) {
			const p = THREE.MathUtils.clamp(scrollProgress, 0, 1);
			applyScrollVisualState(p);
			applyWorldRotation(rotationProgress);
			lastVisualProgress = p;
			lastIntroGate = firstSectionIntroReveal.hasStarted ? firstSectionIntroReveal.gate : 0;
		}

		function setupScrollSequenceTrigger() {
			if (!scrollStage || !ScrollTrigger) {
				return;
			}

			enforceScrollablePage();

			if (scrollTriggerInstance) {
				scrollTriggerInstance.kill();
			}

			scrollTriggerInstance = ScrollTrigger.create({
				trigger: scrollStage,
				start: "top top",
				end: "bottom bottom",
				scrub: 1,
				onUpdate: (self) => {
					scrollSequence.rotationProgress = THREE.MathUtils.clamp(self.progress, 0, 1);
					const mappedProgress = THREE.MathUtils.clamp(
						self.progress / Math.max(SCROLL_SEQUENCE_PROGRESS_PORTION, 0.0001),
						0,
						1
					);
					scrollSequence.progress = mappedProgress;
				}
			});

			enforceScrollablePage();
			ScrollTrigger.refresh();
		}

		function startIntroSequenceIfReady() {
			if (!isGrassReady || !isHouseReady) {
				return;
			}

			if (!scrollTriggerInstance) {
				setupScrollSequenceTrigger();
			}

			enforceScrollablePage();

			startFirstSectionIntroReveal();

			scrollSequence.progress = 0;
			scrollSequence.rotationProgress = 0;
			lastVisualProgress = Number.NaN;
			lastIntroGate = Number.NaN;
			updateIntroSequence(true);
		}

		function updateIntroSequence(force = false) {
			const visualProgress = THREE.MathUtils.clamp(scrollSequence.progress, 0, 1);
			const introGate = firstSectionIntroReveal.hasStarted ? firstSectionIntroReveal.gate : 0;
			const needsVisualUpdate =
				force ||
				!Number.isFinite(lastVisualProgress) ||
				Math.abs(visualProgress - lastVisualProgress) > PERFORMANCE.visualEpsilon ||
				Math.abs(introGate - lastIntroGate) > PERFORMANCE.visualEpsilon;

			if (needsVisualUpdate) {
				applyScrollVisualState(visualProgress);
				lastVisualProgress = visualProgress;
				lastIntroGate = introGate;
			}

			applyWorldRotation(scrollSequence.rotationProgress);
		}

		function generateEvenDiskPoints(count, radius, vacateRect) {
			const points = [];
			const gridSize = Math.ceil(Math.sqrt(count * 1.35));
			const step = (radius * 2) / gridSize;
			const jitter = step * 0.34;

			for (let row = 0; row < gridSize; row++) {
				for (let col = 0; col < gridSize; col++) {
					let x = -radius + (col + 0.5) * step;
					let z = -radius + (row + 0.5) * step;

					x += (Math.random() - 0.5) * jitter;
					z += (Math.random() - 0.5) * jitter;

					if (x * x + z * z > radius * radius) {
						continue;
					}

					if (isPointInsideVacateRect(x, z, vacateRect)) {
						continue;
					}

					points.push(new THREE.Vector2(x, z));
					if (points.length === count) {
						return points;
					}
				}
			}

			let attempts = 0;
			const maxAttempts = count * 120;
			while (points.length < count && attempts < maxAttempts) {
				attempts += 1;
				const r = radius * Math.sqrt(Math.random());
				const theta = Math.random() * Math.PI * 2;
				const x = r * Math.cos(theta);
				const z = r * Math.sin(theta);

				if (isPointInsideVacateRect(x, z, vacateRect)) {
					continue;
				}

				points.push(new THREE.Vector2(x, z));
			}

			if (points.length < count) {
				console.warn("Vacate rectangle removed too much area; generated fewer grass strands:", points.length);
			}

			return points;
		}

		function buildGrassTerrain(radius, innerClearRadius) {
			const geometry = new THREE.CircleGeometry(radius, 200);
			geometry.rotateX(-Math.PI / 2);

			const positions = geometry.attributes.position;
			const colors = [];

			for (let i = 0; i < positions.count; i++) {
				const x = positions.getX(i);
				const z = positions.getZ(i);
				const weight = 1;

				colors.push(weight, weight, weight);

				positions.setY(i, getTerrainHeight(x, z));
			}

			geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
			geometry.computeVertexNormals();

			const material = new THREE.MeshStandardMaterial({
				color: 0x5e875e,
				roughness: 0.98,
				metalness: 0.02
			});
			const terrain = new THREE.Mesh(geometry, material);
			terrain.receiveShadow = true;
			terrain.position.y = -0.08;
			grassSystemGroup.add(terrain);
			return terrain;
		}

		function addGrassInstances(surfaceMesh, grassGeometry, count, radius, vacateRect) {
			const evenPoints = generateEvenDiskPoints(count, radius, vacateRect);
			const instancedMesh = new THREE.InstancedMesh(
				grassGeometry,
				grassMaterial.material,
				evenPoints.length
			);
			instancedMesh.receiveShadow = true;
			instancedMesh.castShadow = false;
			instancedMesh.frustumCulled = false;

			const position = new THREE.Vector3();
			const normal = new THREE.Vector3();
			const quaternion = new THREE.Quaternion();
			const randomQuaternion = new THREE.Quaternion();
			const scale = new THREE.Vector3();
			const yAxis = new THREE.Vector3(0, 1, 0);
			const matrix = new THREE.Matrix4();

			grassInstanceCache.positions.length = 0;
			grassInstanceCache.quaternions.length = 0;
			grassInstanceCache.scales.length = 0;

			for (let i = 0; i < evenPoints.length; i++) {
				const p = evenPoints[i];
				position.set(
					p.x,
					surfaceMesh.position.y + getTerrainHeight(p.x, p.y) + 0.03,
					p.y
				);
				getTerrainNormal(p.x, p.y, normal);

				quaternion.setFromUnitVectors(yAxis, normal.normalize());
				randomQuaternion.setFromAxisAngle(yAxis, Math.random() * Math.PI * 2);
				quaternion.multiply(randomQuaternion);

				const uniformScale = THREE.MathUtils.lerp(0.55, 1.5, Math.random());
				scale.set(
					uniformScale * 0.85,
					uniformScale * THREE.MathUtils.lerp(0.9, 1.9, Math.random()),
					uniformScale * 0.85
				);

				position.y += 0.03;

				grassInstanceCache.positions.push(position.clone());
				grassInstanceCache.quaternions.push(quaternion.clone());
				grassInstanceCache.scales.push(scale.clone());

				matrix.compose(position, quaternion, scale);
				instancedMesh.setMatrixAt(i, matrix);
			}

			instancedMesh.instanceMatrix.needsUpdate = true;
			grassSystemGroup.add(instancedMesh);
			applyGrassStrandLength(HARDCODED_GRASS_STRAND_LENGTH);
			return instancedMesh;
		}

		function rebuildGrassInstances() {
			if (!grassTerrainMesh || !grassBladeGeometry) {
				return;
			}

			if (grassInstancedMesh) {
				grassSystemGroup.remove(grassInstancedMesh);
			}

			grassInstancedMesh = addGrassInstances(
				grassTerrainMesh,
				grassBladeGeometry,
				grassConfig.count,
				grassConfig.terrainRadius,
				null
			);
			syncVacateRectToShader();
		}

		function loadTextureWithFallback(paths) {
			return new Promise((resolve, reject) => {
				const tryLoad = (index) => {
					if (index >= paths.length) {
						reject(new Error(`Failed to load any texture path: ${paths.join(", ")}`));
						return;
					}

					textureLoader.load(
						paths[index],
						(texture) => resolve(texture),
						undefined,
						() => tryLoad(index + 1)
					);
				};

				tryLoad(0);
			});
		}

		const hdrLoader = new RGBELoader();
		hdrLoader.load(
			"./assets/day.hdr",
			(hdrTexture) => {
				hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
				scene.environment = hdrTexture;
				scene.background = hdrTexture;
				scene.environmentIntensity = 1;
				scene.backgroundBlurriness = 0.05;
			},
			undefined,
			(error) => {
				console.error("Failed to load HDR environment:", error);
			}
		);

		const gltfLoader = new GLTFLoader();

		function loadGrassBladeGeometry() {
			const glbPaths = [
				"./grassLODs.glb"
			];

			return new Promise((resolve) => {
				const tryLoad = (index) => {
					if (index >= glbPaths.length) {
						resolve(createFallbackGrassGeometry());
						return;
					}

					gltfLoader.load(
						glbPaths[index],
						(gltf) => {
							let selectedGeometry = null;

							gltf.scene.traverse((child) => {
								if (selectedGeometry || !child.isMesh) {
									return;
								}

								if (child.name.includes("LOD00")) {
									selectedGeometry = child.geometry.clone();
								}
							});

							if (!selectedGeometry) {
								gltf.scene.traverse((child) => {
									if (selectedGeometry || !child.isMesh) {
										return;
									}
									selectedGeometry = child.geometry.clone();
								});
							}

							if (!selectedGeometry) {
								resolve(createFallbackGrassGeometry());
								return;
							}

							selectedGeometry.scale(3.2, 3.2, 3.2);
							resolve(selectedGeometry);
						},
						undefined,
						() => tryLoad(index + 1)
					);
				};

				tryLoad(0);
			});
		}

		async function setupFluffyGrass() {
			grassTerrainMesh = buildGrassTerrain(grassConfig.terrainRadius, grassConfig.innerClearRadius);

			try {
				const [grassAlphaTexture, noiseTexture, grassGeometry] = await Promise.all([
					loadTextureWithFallback([
						"./grass.jpeg"
					]),
					loadTextureWithFallback([
						"./perlinnoise.webp"
					]),
					loadGrassBladeGeometry()
				]);

				noiseTexture.wrapS = THREE.RepeatWrapping;
				noiseTexture.wrapT = THREE.RepeatWrapping;

				grassMaterial.setupTextures(grassAlphaTexture, noiseTexture);
				grassBladeGeometry = grassGeometry;
				rebuildGrassInstances();
				isGrassReady = true;
				startIntroSequenceIfReady();
			} catch (error) {
				console.error("Failed to initialize FluffyGrass assets:", error);
			}
		}
		let houseModel = null;
		const centeredModelPosition = new THREE.Vector3();
		const MODEL_Y_MAX = 1.2;
		const HOUSE_SCALE_MULTIPLIER = 1.4;
		const modelOffset = { x: 0, y: MODEL_Y_MAX, z: 0 };

		function applyModelOffset() {
			if (!houseModel) {
				return;
			}

			modelOffset.y = Math.min(modelOffset.y, MODEL_Y_MAX);

			const nextX = centeredModelPosition.x + modelOffset.x;
			const nextY = centeredModelPosition.y + modelOffset.y;
			const nextZ = centeredModelPosition.z + modelOffset.z;

			houseModel.position.set(
				nextX,
				nextY,
				nextZ
			);
			updateHouseDissolveBounds();
		}

		gltfLoader.load(
			"./assets/House.glb",
			(gltf) => {
				houseModel = gltf.scene;
				houseShadowMeshes.length = 0;

				houseModel.traverse((obj) => {
					if (obj.isMesh) {
						obj.castShadow = false;
						obj.receiveShadow = true;
						houseShadowMeshes.push(obj);
					}
				});

				// Center and normalize model scale for consistent camera presets.
				const box = new THREE.Box3().setFromObject(houseModel);
				const center = box.getCenter(new THREE.Vector3());
				houseModel.position.sub(center);

				const size = box.getSize(new THREE.Vector3());
				const maxDimension = Math.max(size.x, size.y, size.z);
				if (maxDimension > 0) {
					const uniformScale = (9 * HOUSE_SCALE_MULTIPLIER) / maxDimension;
					houseModel.scale.setScalar(uniformScale);
					houseModel.position.multiplyScalar(uniformScale);
				}

				centeredModelPosition.copy(houseModel.position);
				applyModelOffset();
				collectHouseDissolveMaterials(houseModel);
				setHouseDissolveProgress(HOUSE_DISSOLVE_PROGRESS_START);

				worldScrollGroup.add(houseModel);
				isHouseReady = true;
				startIntroSequenceIfReady();
			},
			undefined,
			(error) => {
				console.error("Failed to load GLB model:", error);
			}
		);

		const params = {
			autoRotate: false,
			environmentIntensity: 1,
			exposure: 1,
			zoomInLimit: controls.minDistance,
			zoomOutLimit: controls.maxDistance,
			logCameraPose: () => {
				console.log("Camera Position:", camera.position.toArray().map((n) => Number(n.toFixed(3))));
				console.log("Camera Target:", controls.target.toArray().map((n) => Number(n.toFixed(3))));
			}
		};

		function applyZoomRange(changed) {
			const minGap = 0.1;

			if (params.zoomInLimit > params.zoomOutLimit - minGap) {
				if (changed === "in") {
					params.zoomInLimit = params.zoomOutLimit - minGap;
				} else {
					params.zoomOutLimit = params.zoomInLimit + minGap;
				}
			}

			controls.minDistance = Math.max(0.1, params.zoomInLimit);
			controls.maxDistance = Math.max(controls.minDistance + minGap, params.zoomOutLimit);
		}

		const gui = DEBUG_MODE ? new GUI({ title: "Scene Debugger" }) : null;

		if (gui) {
		const cameraFolder = gui.addFolder("Camera POV");
		cameraFolder.add(camera.position, "x", -40, 40, 0.01).name("Cam X").listen();
		cameraFolder.add(camera.position, "y", LOCKED_CAMERA_Y, LOCKED_CAMERA_Y, 0.01).name("Cam Y (Locked)").listen();
		cameraFolder.add(camera.position, "z", -40, 40, 0.01).name("Cam Z").listen();
		cameraFolder.add(controls.target, "x", -20, 20, 0.01).name("Target X").listen();
		cameraFolder.add(controls.target, "y", LOCKED_CAMERA_Y, LOCKED_CAMERA_Y, 0.01).name("Target Y (Locked)").listen();
		cameraFolder.add(controls.target, "z", -20, 20, 0.01).name("Target Z").listen();
		cameraFolder.add(params, "logCameraPose").name("Log Camera Pose");

		const modelFolder = gui.addFolder("Model Position");
		modelFolder.add(modelOffset, "x", -20, 20, 0.01).name("X").onChange(applyModelOffset);
		modelFolder.add(modelOffset, "y", -20, MODEL_Y_MAX, 0.01).name("Y").onChange(applyModelOffset);
		modelFolder.add(modelOffset, "z", -20, 20, 0.01).name("Z").onChange(applyModelOffset);

		const renderFolder = gui.addFolder("Render");
		renderFolder
			.add(params, "environmentIntensity", 0, 4, 0.01)
			.name("Env Intensity")
			.onChange((value) => {
				scene.environmentIntensity = value;
			});
		renderFolder
			.add(params, "exposure", 0.2, 3, 0.01)
			.name("Exposure")
			.onChange((value) => {
				renderer.toneMappingExposure = value;
			});
		renderFolder.add(params, "autoRotate").name("Auto Rotate").onChange((value) => {
			controls.autoRotate = value;
			controls.autoRotateSpeed = 0.6;
		});

		const houseRevealParams = {
			particleIntensity: houseDissolveUniformData.uEdgeIntensity.value,
			particleDensity: houseDissolveUniformData.uFreq.value
		};

		const houseRevealFolder = gui.addFolder("House Reveal FX");
		houseRevealFolder
			.add(houseRevealParams, "particleIntensity", 0, 3, 0.01)
			.name("Particle Intensity")
			.onChange((value) => {
				houseDissolveUniformData.uEdgeIntensity.value = value;
			});
		houseRevealFolder
			.add(houseRevealParams, "particleDensity", 0.02, 0.5, 0.01)
			.name("Particle Density")
			.onChange((value) => {
				houseDissolveUniformData.uFreq.value = value;
			});

		const grassParams = {
			baseColor: "#313f1b",
			tipColor1: "#9bd38d",
			tipColor2: "#1f352a",
			strandLength: HARDCODED_GRASS_STRAND_LENGTH,
			planeY: HARDCODED_GRASS_PLANE_Y,
			vacateRectEnabled: grassVacateRectTarget.enabled,
			vacateRectX: grassVacateRectTarget.centerX,
			vacateRectZ: grassVacateRectTarget.centerZ,
			vacateRectWidth: grassVacateRectTarget.width,
			vacateRectDepth: grassVacateRectTarget.depth,
			noiseScale: grassMaterial.uniforms.uNoiseScale.value,
			lightIntensity: grassMaterial.uniforms.uGrassLightIntensity.value,
			shadowDarkness: grassMaterial.uniforms.uShadowDarkness.value,
			enableShadows: true,
			visible: true
		};

		const grassFolder = gui.addFolder("Fluffy Grass");
		grassFolder.addColor(grassParams, "baseColor").name("Base").onChange((value) => {
			grassMaterial.uniforms.baseColor.value.set(value);
		});
		grassFolder.addColor(grassParams, "tipColor1").name("Tip 1").onChange((value) => {
			grassMaterial.uniforms.tipColor1.value.set(value);
		});
		grassFolder.addColor(grassParams, "tipColor2").name("Tip 2").onChange((value) => {
			grassMaterial.uniforms.tipColor2.value.set(value);
		});
		grassFolder.add(grassParams, "planeY", -5, 5, 0.01).name("Grass Plane Y").onChange((value) => {
			grassSystemGroup.position.y = value;
		});

		const vacateRectFolder = grassFolder.addFolder("Vacate Rectangle");
		vacateRectFolder.add(grassParams, "vacateRectEnabled").name("Enabled").onChange((value) => {
			grassVacateRectTarget.enabled = value;
			if (isGrassReady) {
				applyScrollSequenceProgress(scrollSequence.progress);
			}
		});
		vacateRectFolder.add(grassParams, "vacateRectX", -60, 60, 0.1).name("Center X").onChange((value) => {
			grassVacateRectTarget.centerX = value;
			if (isGrassReady) {
				applyScrollSequenceProgress(scrollSequence.progress);
			}
		});
		vacateRectFolder.add(grassParams, "vacateRectZ", -60, 60, 0.1).name("Center Z").onChange((value) => {
			grassVacateRectTarget.centerZ = value;
			if (isGrassReady) {
				applyScrollSequenceProgress(scrollSequence.progress);
			}
		});
		vacateRectFolder.add(grassParams, "vacateRectWidth", 0, 80, 0.1).name("Width").onChange((value) => {
			grassVacateRectTarget.width = value;
			if (isGrassReady) {
				applyScrollSequenceProgress(scrollSequence.progress);
			}
		});
		vacateRectFolder.add(grassParams, "vacateRectDepth", 0, 80, 0.1).name("Depth").onChange((value) => {
			grassVacateRectTarget.depth = value;
			if (isGrassReady) {
				applyScrollSequenceProgress(scrollSequence.progress);
			}
		});

		grassFolder.add(grassParams, "noiseScale", 0.1, 5, 0.01).name("Noise Scale").onChange((value) => {
			grassMaterial.uniforms.uNoiseScale.value = value;
		});
		grassFolder.add(grassParams, "lightIntensity", 0, 2, 0.01).name("Light").onChange((value) => {
			grassMaterial.uniforms.uGrassLightIntensity.value = value;
		});
		grassFolder.add(grassParams, "shadowDarkness", 0, 1, 0.01).name("Shadow").onChange((value) => {
			grassMaterial.uniforms.uShadowDarkness.value = value;
		});
		grassFolder.add(grassParams, "enableShadows").name("Shadows").onChange((value) => {
			grassMaterial.uniforms.uEnableShadows.value = value ? 1 : 0;
		});
		grassFolder.add(grassParams, "visible").name("Visible").onChange((value) => {
			if (grassInstancedMesh) {
				grassInstancedMesh.visible = value;
			}
		});

		const zoomFolder = gui.addFolder("Zoom Range");
		zoomFolder.add(controls, "zoomSpeed", 0.2, 3, 0.01).name("Zoom Speed");
		zoomFolder
			.add(params, "zoomInLimit", 0.1, 20, 0.01)
			.name("Zoom In Limit")
			.onChange(() => applyZoomRange("in"))
			.listen();
		zoomFolder
			.add(params, "zoomOutLimit", 2, 240, 0.1)
			.name("Zoom Out Limit")
			.onChange(() => applyZoomRange("out"))
			.listen();
		}

		applyZoomRange();

		const stats = DEBUG_MODE ? new Stats() : null;
		if (stats) {
			(sceneSection ?? document.body).appendChild(stats.dom);
			stats.dom.style.left = "auto";
			stats.dom.style.right = "8px";
			stats.dom.style.top = "8px";
		}

		camera.position.fromArray(INITIAL_CAMERA_POSE.position);
		controls.target.fromArray(INITIAL_CAMERA_POSE.target);
		controls.update();
		enforceLockedCameraY();
		setupFluffyGrass();

		function animate() {
			requestAnimationFrame(animate);
			const deltaTime = clock.getDelta();
			scrollSequence.constantRotationY = (
				scrollSequence.constantRotationY +
				deltaTime * scrollSequence.constantSpinRadPerSec
			) % (Math.PI * 2);
			updateIntroSequence();

			controls.update();
			enforceLockedCameraY();
			grassMaterial.update(clock.getElapsedTime());
			if (stats) {
				stats.update();
			}
			renderer.render(scene, camera);
		}

		animate();

		window.addEventListener("resize", () => {
			camera.aspect = window.innerWidth / window.innerHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(window.innerWidth, window.innerHeight);
			renderer.setPixelRatio(Math.min(window.devicePixelRatio, PERFORMANCE.maxPixelRatio));
			enforceLockedCameraY();
			enforceScrollablePage();
			if (ScrollTrigger) {
				ScrollTrigger.refresh();
			}
		});

		// Expose scene objects in DevTools for debugging.
		window.THREE_DEBUG = {
			scene,
			camera,
			renderer,
			controls,
			modelOffset,
			applyModelOffset,
			get houseModel() {
				return houseModel;
			}
		};
