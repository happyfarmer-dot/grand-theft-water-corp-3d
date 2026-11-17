// js/main.js
// 遊戲主迴圈、物理步進、3D 主角控制、攝影機追蹤、雷達小地圖、支線挑戰與 GTA 慢動作結算狀態機

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { AudioSystem } from './audio.js';
import { GameWorld } from './world.js';
import { VehicleManager } from './vehicles.js';
import { WeaponSystem, WEAPON_LIST } from './weapons.js';
import { NPCManager } from './npc.js';

class GrandTheftWaterCorpApp {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.floatingLabels = document.getElementById('floating-labels');
    this.radarCanvas = document.getElementById('radar-canvas');
    this.radarCtx = this.radarCanvas ? this.radarCanvas.getContext('2d') : null;

    this.audio = new AudioSystem();

    // Game State
    this.totalDamageCash = 0;
    this.wantedPoints = 0;
    this.wantedStars = 0;
    this.maxWantedReached = 0;
    this.stealthTimer = 0;
    this.SETTLEMENT_DELAY = 8.0;

    this.timeScale = 1.0;
    this.settlementState = null; // null | 'overworked' | 'busted' | 'mission_passed'
    this.activeMission = null;
    this.portraitDismissed = false;

    // Input State (Desktop + Mobile Multi-Touch)
    this.input = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      attack: false,
      joyX: 0,
      joyY: 0
    };
    this.mouseYaw = 0;

    this.initThreeAndPhysics();
    this.initPlayer();
    this.initSubsystems();
    this.bindControls();
    this.updateWantedHUD();
    this.checkOrientationGuard();

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.animate(t));
  }

  initThreeAndPhysics() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.004);

    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(58, w / h, 0.1, 220);
    // 第三人稱攝影機位於主角後上方 (0, 12, 14) 並俯瞰主角，避免被天花板或牆壁遮擋
    this.camera.position.set(0, 12, 14);
    this.camera.lookAt(0, 1, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 全局照明：確保一進入遊戲即清楚看見 3D 辦公室地板、辦公桌、隔間、主角與同事
    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(22, 38, 24);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 110;
    const d = 42;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    this.scene.add(sun);

    // Cannon-es Physics World with allowSleep = true
    this.physicsWorld = new CANNON.World();
    this.physicsWorld.gravity.set(0, -24, 0);
    this.physicsWorld.allowSleep = true;

    const onWindowResize = () => {
      const rw = window.innerWidth;
      const rh = window.innerHeight;
      this.camera.aspect = rw / rh;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(rw, rh);
      this.checkOrientationGuard();
    };
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('orientationchange', () => setTimeout(onWindowResize, 120));
  }

  checkOrientationGuard() {
    const guard = document.getElementById('portrait-guard');
    if (!guard) return;
    const isPortrait = window.innerHeight > window.innerWidth;
    if (isPortrait && !this.portraitDismissed && window.innerWidth <= 1024) {
      guard.classList.add('show');
    } else {
      guard.classList.remove('show');
    }
  }

  initPlayer() {
    const group = new THREE.Group();

    // Blue Taiwan Water Corp safety vest torso
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.82, 0.38),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.4 })
    );
    torso.position.y = 0.12;
    torso.castShadow = true;
    group.add(torso);

    // Reflective safety stripes
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.14, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    );
    stripe.position.y = 0.08;
    group.add(stripe);

    // Head + Yellow Engineer Safety Helmet
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.48, 0.48),
      new THREE.MeshStandardMaterial({ color: 0xfde68a })
    );
    head.position.y = 0.78;
    group.add(head);

    const helmet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.34, 0.22, 12),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 })
    );
    helmet.position.y = 1.06;
    group.add(helmet);

    // Right arm + Pipe Wrench / Weapon visual holder
    this.rightArmGroup = new THREE.Group();
    this.rightArmGroup.position.set(0.42, 0.35, 0);
    const armMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.55, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x0284c7 })
    );
    armMesh.position.y = -0.2;
    this.rightArmGroup.add(armMesh);

    const wrenchMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.65, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.6 })
    );
    wrenchMesh.position.set(0, -0.45, 0.28);
    wrenchMesh.rotation.x = Math.PI / 3;
    this.rightArmGroup.add(wrenchMesh);
    group.add(this.rightArmGroup);

    // Legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
    this.playerLeftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.6, 0.24), legMat);
    this.playerLeftLeg.position.set(-0.16, -0.55, 0);
    this.playerRightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.6, 0.24), legMat);
    this.playerRightLeg.position.set(0.16, -0.55, 0);
    group.add(this.playerLeftLeg, this.playerRightLeg);

    // Golden Lightning Ring for 6s Caffeine Overclock!
    this.caffeineAura = new THREE.Mesh(
      new THREE.TorsoGeometry ? new THREE.OctahedronGeometry(1.1, 1) : new THREE.OctahedronGeometry(1.1, 1),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, wireframe: true })
    );
    this.caffeineAura.visible = false;
    group.add(this.caffeineAura);

    group.position.set(0, 1.0, -2);
    this.scene.add(group);

    const body = new CANNON.Body({
      mass: 65,
      shape: new CANNON.Box(new CANNON.Vec3(0.4, 0.9, 0.4)),
      position: new CANNON.Vec3(0, 1.0, -2),
      linearDamping: 0.15
    });
    body.angularFactor.set(0, 1, 0);
    this.physicsWorld.addBody(body);

    this.player = {
      mesh: group,
      body,
      yaw: 0,
      health: 100,
      caffeineTimer: 0,
      isJumping: false,
      swingAnimTimer: 0,
      kickAnimTimer: 0
    };
  }

  initSubsystems() {
    const callbacks = {
      onDamageAdded: (amount, reason, pos) => this.addPropertyDamage(amount, reason, pos),
      onPopup: (pos, text, color) => this.spawnFloatingPopup(pos, text, color),
      onComboBanner: (text) => this.showComboBanner(text),
      onPropDestroyed: (prop) => this.handleMissionPropDestroyed(prop),
      onBossDunked: (npc) => this.handleMissionBossDunked(npc),
      onPlayerDamaged: (dmg) => this.damagePlayer(dmg),
      onPlayerBusted: () => this.triggerSettlement('busted')
    };

    this.gameWorld = new GameWorld(this.scene, this.physicsWorld, this.audio, callbacks);
    this.vehicleManager = new VehicleManager(this.scene, this.physicsWorld, this.audio, this.gameWorld, callbacks);
    this.weaponSystem = new WeaponSystem(this.scene, this.audio, this.gameWorld, callbacks);
    this.npcManager = new NPCManager(this.scene, this.physicsWorld, this.audio, this.gameWorld, this.camera, callbacks);
  }

  bindControls() {
    // 自動偵測觸控或小螢幕裝置（強制顯示雙手觸控介面）
    const shouldShowTouch =
      navigator.maxTouchPoints > 0 ||
      'ontouchstart' in window ||
      window.innerWidth <= 1024;
    if (shouldShowTouch) {
      document.body.classList.add('touch-enabled');
    }

    // 首次互動解鎖 Web Audio API 與電台
    const unlockAudio = () => {
      this.audio.init();
    };
    window.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
    window.addEventListener('keydown', unlockAudio, { once: true, passive: true });

    // 鍵盤控制
    window.addEventListener('keydown', (e) => {
      if (this.settlementState) {
        if (e.code === 'Space') this.respawnAndContinue();
        return;
      }
      const code = e.code;
      if (code === 'KeyW' || code === 'ArrowUp') this.input.forward = true;
      if (code === 'KeyS' || code === 'ArrowDown') this.input.backward = true;
      if (code === 'KeyA' || code === 'ArrowLeft') this.input.left = true;
      if (code === 'KeyD' || code === 'ArrowRight') this.input.right = true;
      if (code === 'Space') {
        this.input.jump = true;
        if (!this.vehicleManager.currentVehicle && this.player.body.position.y < 1.35) {
          this.player.body.velocity.y = 10.5;
          this.player.isJumping = true;
          this.audio.playSFX('punch');
        }
      }
      if (code === 'KeyF') this.handleInteractOrHijack();
      if (code === 'KeyQ') this.weaponSystem.openWheel();
      if (code === 'KeyE' || code === 'KeyR') this.handleSpecialOrForklift();

      if (code.startsWith('Digit')) {
        const num = parseInt(code.replace('Digit', ''), 10);
        if (num >= 1 && num <= 8) this.weaponSystem.selectWeapon(num - 1);
      }
    });

    window.addEventListener('keyup', (e) => {
      const code = e.code;
      if (code === 'KeyW' || code === 'ArrowUp') this.input.forward = false;
      if (code === 'KeyS' || code === 'ArrowDown') this.input.backward = false;
      if (code === 'KeyA' || code === 'ArrowLeft') this.input.left = false;
      if (code === 'KeyD' || code === 'ArrowRight') this.input.right = false;
      if (code === 'Space') {
        this.input.jump = false;
        this.player.isJumping = false;
      }
      if (code === 'KeyQ') this.weaponSystem.closeWheel();
    });

    // 滑鼠瞄準與左鍵攻擊
    window.addEventListener('pointermove', (e) => {
      if (this.weaponSystem.wheelOpen || e.pointerType !== 'mouse') return;
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      this.mouseYaw = Math.atan2(nx, ny);
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 0 && !this.settlementState && !this.weaponSystem.wheelOpen) {
        this.audio.init();
        this.input.attack = true;
        if (!this.vehicleManager.currentVehicle) {
          this.weaponSystem.fireWeapon(this.player, this.npcManager);
        } else if (this.vehicleManager.currentVehicle.type === 'forklift') {
          this.vehicleManager.triggerForkliftAction(this.vehicleManager.currentVehicle, this.npcManager);
        }
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') {
        this.input.attack = false;
      }
    });

    // 武器卡點擊開啟輪盤
    const weaponCard = document.getElementById('equipped-weapon-card');
    if (weaponCard) {
      weaponCard.addEventListener('click', () => {
        if (this.weaponSystem.wheelOpen) this.weaponSystem.closeWheel();
        else this.weaponSystem.openWheel();
      });
    }

    const promptEl = document.getElementById('interaction-prompt');
    if (promptEl) {
      promptEl.addEventListener('click', () => this.handleInteractOrHijack());
    }

    // 右上角「📱 觸控開關」手動切換按鈕
    const btnToggleTouch = document.getElementById('btn-toggle-touch');
    if (btnToggleTouch) {
      btnToggleTouch.addEventListener('click', () => {
        document.body.classList.toggle('touch-enabled');
      });
    }

    // 桌面版可收合操作指南
    const toggleHelpBtn = document.getElementById('toggle-help-btn');
    const helpPanel = document.getElementById('controls-help-panel');
    const helpArrow = document.getElementById('help-arrow');
    if (toggleHelpBtn && helpPanel) {
      toggleHelpBtn.addEventListener('click', () => {
        const collapsed = helpPanel.classList.toggle('collapsed');
        if (helpArrow) helpArrow.textContent = collapsed ? '▶' : '▼';
      });
    }

    // 手機版「❓ 說明」彈窗
    const helpModal = document.getElementById('help-modal');
    const btnOpenHelp = document.getElementById('btn-open-help');
    const btnCloseHelp = document.getElementById('btn-close-help');
    if (btnOpenHelp && helpModal) {
      btnOpenHelp.addEventListener('click', () => helpModal.classList.add('open'));
    }
    if (btnCloseHelp && helpModal) {
      btnCloseHelp.addEventListener('click', () => helpModal.classList.remove('open'));
    }

    // 音效靜音開關
    const btnAudio = document.getElementById('btn-toggle-audio');
    if (btnAudio) {
      btnAudio.addEventListener('click', () => {
        this.audio.init();
        this.audio.muted = !this.audio.muted;
        btnAudio.textContent = this.audio.muted ? '🔇' : '🔊';
      });
    }

    // 直向防呆提示「仍要直向遊玩」關閉鈕
    const btnDismissPortrait = document.getElementById('btn-dismiss-portrait');
    if (btnDismissPortrait) {
      btnDismissPortrait.addEventListener('click', () => {
        this.portraitDismissed = true;
        const guard = document.getElementById('portrait-guard');
        if (guard) guard.classList.remove('show');
      });
    }

    // 通緝測試按鈕（桌面面板 & 說明彈窗共用）
    const addStarFn = () => {
      const nextStar = Math.min(5, this.wantedStars + 1);
      const thresholds = [0, 12000, 32000, 65000, 110000, 170000];
      this.wantedPoints = thresholds[nextStar];
      this.evaluateWantedLevel();
      this.npcManager.spawnEnforcementForStar(this.wantedStars, this.getActivePosition());
    };
    const clearStarFn = () => {
      this.wantedStars = 0;
      this.wantedPoints = 0;
      this.stealthTimer = 0;
      this.npcManager.clearAllEnforcement();
      this.updateWantedHUD(false);
    };

    ['btn-add-star', 'btn-modal-add-star'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', addStarFn);
    });
    ['btn-clear-star', 'btn-modal-clear-star'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', clearStarFn);
    });

    const btnRespawn = document.getElementById('gta-respawn-btn');
    if (btnRespawn) {
      btnRespawn.addEventListener('click', () => this.respawnAndContinue());
    }

    // 綁定多點觸控虛擬搖桿與右下角動作按鈕
    this.bindTouchControls();
  }

  bindTouchControls() {
    const joyZone = document.getElementById('joystick-zone');
    const joyKnob = document.getElementById('joystick-knob');
    if (joyZone && joyKnob) {
      let activePointerId = null;

      const updateJoy = (clientX, clientY) => {
        const rect = joyZone.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = clientX - cx;
        const dy = clientY - cy;
        const maxR = rect.width * 0.4;
        const dist = Math.min(maxR, Math.hypot(dx, dy));
        const angle = Math.atan2(dy, dx);
        const kx = Math.cos(angle) * dist;
        const ky = Math.sin(angle) * dist;
        joyKnob.style.transform = `translate(${kx}px, ${ky}px)`;
        this.input.joyX = kx / maxR;
        this.input.joyY = ky / maxR;
        this.input.forward = this.input.joyY < -0.25;
        this.input.backward = this.input.joyY > 0.25;
        this.input.left = this.input.joyX < -0.25;
        this.input.right = this.input.joyX > 0.25;
        if (dist > 8) this.mouseYaw = Math.atan2(this.input.joyX, this.input.joyY);
      };

      const resetJoy = () => {
        activePointerId = null;
        joyKnob.style.transform = 'translate(0px, 0px)';
        this.input.joyX = 0;
        this.input.joyY = 0;
        this.input.forward = false;
        this.input.backward = false;
        this.input.left = false;
        this.input.right = false;
      };

      joyZone.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.audio.init();
        if (activePointerId === null) {
          activePointerId = e.pointerId;
          try { joyZone.setPointerCapture(e.pointerId); } catch (_) {}
          updateJoy(e.clientX, e.clientY);
        }
      });
      joyZone.addEventListener('pointermove', (e) => {
        if (e.pointerId === activePointerId) {
          e.preventDefault();
          updateJoy(e.clientX, e.clientY);
        }
      });
      joyZone.addEventListener('pointerup', (e) => {
        if (e.pointerId === activePointerId) resetJoy();
      });
      joyZone.addEventListener('pointercancel', (e) => {
        if (e.pointerId === activePointerId) resetJoy();
      });
    }

    const bindBtn = (id, downFn, upFn) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.audio.init();
        if (downFn) downFn();
      });
      if (upFn) {
        el.addEventListener('pointerup', (e) => {
          e.preventDefault();
          upFn();
        });
        el.addEventListener('pointercancel', upFn);
      }
    };

    // 步行 5 顆動作按鈕
    bindBtn('tbtn-wheel', () => {
      if (this.weaponSystem.wheelOpen) this.weaponSystem.closeWheel();
      else this.weaponSystem.openWheel();
    });
    bindBtn('tbtn-special', () => this.handleSpecialOrForklift());
    bindBtn('tbtn-hijack', () => this.handleInteractOrHijack());
    bindBtn('tbtn-jump', () => {
      this.input.jump = true;
      if (this.player.body.position.y < 1.35) this.player.body.velocity.y = 10.5;
      this.player.isJumping = true;
    }, () => {
      this.input.jump = false;
      this.player.isJumping = false;
    });
    bindBtn('tbtn-attack', () => {
      this.input.attack = true;
      this.weaponSystem.fireWeapon(this.player, this.npcManager);
    }, () => {
      this.input.attack = false;
    });

    // 駕駛載具按鈕
    bindBtn('tbtn-veh-atk', () => {
      if (this.vehicleManager.currentVehicle && this.vehicleManager.currentVehicle.type === 'forklift') {
        this.vehicleManager.triggerForkliftAction(this.vehicleManager.currentVehicle, this.npcManager);
      } else {
        this.input.attack = true;
      }
    }, () => {
      this.input.attack = false;
    });
    bindBtn('tbtn-exit', () => this.handleInteractOrHijack());
    bindBtn('tbtn-brake', () => {
      this.input.backward = true;
      this.input.jump = true;
    }, () => {
      this.input.backward = false;
      this.input.jump = false;
    });
    bindBtn('tbtn-gas', () => {
      this.input.forward = true;
    }, () => {
      this.input.forward = false;
    });
  }

  getActivePosition() {
    return this.vehicleManager.currentVehicle
      ? this.vehicleManager.currentVehicle.body.position
      : this.player.body.position;
  }

  handleSpecialOrForklift() {
    if (this.vehicleManager.currentVehicle) {
      if (this.vehicleManager.currentVehicle.type === 'forklift') {
        this.vehicleManager.triggerForkliftAction(this.vehicleManager.currentVehicle, this.npcManager);
      } else {
        this.audio.playSFX('siren');
      }
    } else {
      this.weaponSystem.triggerSpecial(this.player, this.npcManager);
    }
  }

  handleInteractOrHijack() {
    const walkGroup = document.getElementById('touch-walk-btns');
    const driveGroup = document.getElementById('touch-drive-btns');

    // 若正在駕駛 -> 下車並切換回步行按鈕組
    if (this.vehicleManager.currentVehicle) {
      const v = this.vehicleManager.currentVehicle;
      this.vehicleManager.currentVehicle = null;
      this.player.body.position.set(v.body.position.x + 2.2, 1.2, v.body.position.z);
      this.player.body.velocity.set(0, 4, 0);
      this.player.mesh.visible = true;
      if (walkGroup) walkGroup.style.display = 'block';
      if (driveGroup) driveGroup.style.display = 'none';
      this.spawnFloatingPopup(this.player.body.position, `🚪 下車：${v.name}`, '#38bdf8');
      return;
    }

    // 檢查支線任務光圈
    const pPos = this.player.body.position;
    for (const m of this.gameWorld.missionRings) {
      if (Math.hypot(pPos.x - m.x, pPos.z - m.z) < 3.2) {
        this.startSideMission(m);
        return;
      }
    }

    // 檢查附近可搶奪載具
    const nearestCar = this.vehicleManager.findNearestVehicle(pPos, 4.5);
    if (nearestCar) {
      this.vehicleManager.currentVehicle = nearestCar;
      this.player.mesh.visible = false;
      this.audio.toggleRadio(true);
      this.audio.pushBreakingNews(`🎙️【FM 98.7 水公司之聲】插播最新路況：營業處有一名員工搶走了「${nearestCar.name}」正在橫衝直撞！`);
      if (walkGroup) walkGroup.style.display = 'none';
      if (driveGroup) driveGroup.style.display = 'block';

      const witness = this.npcManager.findNearestNPC(nearestCar.body.position.x, nearestCar.body.position.z, 9.0);
      if (witness) {
        this.npcManager.showBubble(witness, '這是公家車你不能開走！', true);
      }
      this.spawnFloatingPopup(nearestCar.body.position, `🚗 搶奪駕駛：${nearestCar.name}`, '#ffbe0b');
    }
  }

  startSideMission(missionCfg) {
    if (!missionCfg) return;
    this.activeMission = {
      ...missionCfg,
      progress: 0,
      timeLeft: missionCfg.duration,
      startDamage: this.totalDamageCash
    };
    this.audio.playSFX('caffeine_boost');
    this.showComboBanner(`🏁 任務開始：${missionCfg.title}`);
    const banner = document.getElementById('mission-banner');
    if (banner) banner.classList.add('active');
    this.updateMissionHUD();
  }

  handleMissionPropDestroyed(prop) {
    if (!this.activeMission) return;
    if (this.activeMission.id === 'smash_pcs') {
      this.activeMission.progress++;
      this.updateMissionHUD();
      if (this.activeMission.progress >= this.activeMission.targetCount) {
        this.completeSideMission();
      }
    }
  }

  handleMissionBossDunked() {
    if (!this.activeMission) return;
    if (this.activeMission.id === 'forklift_boss') {
      this.activeMission.progress++;
      this.updateMissionHUD();
      if (this.activeMission.progress >= this.activeMission.targetCount) {
        this.completeSideMission();
      }
    }
  }

  updateMissionHUD() {
    if (!this.activeMission) return;
    const m = this.activeMission;
    if (m.id === 'water_electric') {
      m.progress = Math.min(m.targetCount, this.totalDamageCash - m.startDamage);
      if (m.progress >= m.targetCount) {
        this.completeSideMission();
        return;
      }
    }

    const titleEl = document.getElementById('mission-title');
    const progEl = document.getElementById('mission-progress');

    if (titleEl) titleEl.textContent = m.title;
    if (progEl) progEl.textContent = `進度：${m.progress} / ${m.targetCount} ｜ ${Math.max(0, m.timeLeft).toFixed(1)}s`;
  }

  completeSideMission() {
    const m = this.activeMission;
    this.activeMission = null;
    const banner = document.getElementById('mission-banner');
    if (banner) banner.classList.remove('active');
    this.addPropertyDamage(50000, `完成支線任務：${m.title}`, this.getActivePosition());
    this.triggerSettlement('mission_passed');
  }

  addPropertyDamage(amount, reason, pos) {
    this.totalDamageCash += amount;
    this.wantedPoints += amount;

    const dmgEl = document.getElementById('damage-cash-val');
    if (dmgEl) {
      dmgEl.textContent = this.totalDamageCash.toLocaleString('en-US');
    }

    this.evaluateWantedLevel();
    if (this.activeMission && this.activeMission.id === 'water_electric') {
      this.updateMissionHUD();
    }
  }

  evaluateWantedLevel() {
    const thresholds = [0, 12000, 32000, 65000, 110000, 170000];
    let newStars = 0;
    for (let s = 5; s >= 1; s--) {
      if (this.wantedPoints >= thresholds[s]) {
        newStars = s;
        break;
      }
    }

    if (newStars > this.wantedStars) {
      this.wantedStars = newStars;
      this.maxWantedReached = Math.max(this.maxWantedReached, newStars);
      this.stealthTimer = 0;
      this.audio.playSFX('siren');
      this.npcManager.spawnEnforcementForStar(this.wantedStars, this.getActivePosition());

      if (this.wantedStars === 5) {
        this.showComboBanner('🚨 5 星最高通緝！防汛特勤隊出動＆全館供水總閥超壓爆管！');
      }
    }
    this.updateWantedHUD();
  }

  updateWantedHUD(isBlinking = false) {
    const starsWrap = document.getElementById('wanted-stars-box');
    const unitLabel = document.getElementById('wanted-unit-label');

    if (starsWrap) {
      starsWrap.classList.toggle('evading', isBlinking);
      const starSpans = starsWrap.querySelectorAll('.wanted-star');
      starSpans.forEach((el, idx) => {
        el.classList.toggle('active', idx < this.wantedStars);
      });
    }

    const descriptions = [
      '目前無通緝',
      '★1 總務組警告：雞毛撢子追擊',
      '★★2 保全與政風處：電擊棒圍捕',
      '★★★3 工務搶修班：水砲封鎖',
      '★★★★4 總處督導空降：退件飛彈',
      '★★★★★5 防汛特勤隊：全館爆管！'
    ];
    if (unitLabel) unitLabel.textContent = descriptions[this.wantedStars] || descriptions[0];
  }

  damagePlayer(dmg) {
    if (this.settlementState) return;
    this.player.health = Math.max(0, this.player.health - dmg);
    const bar = document.getElementById('hp-bar-fill');
    if (bar) bar.style.width = `${this.player.health}%`;
    if (this.player.health <= 0) {
      this.triggerSettlement('overworked');
    }
  }

  // GTA 經典全螢幕慢動作結算畫面
  triggerSettlement(type) {
    if (this.settlementState) return;
    this.settlementState = type;
    this.timeScale = 0.22;

    const screen = document.getElementById('gta-overlay');
    const titleEl = document.getElementById('gta-overlay-title');
    const subEl = document.getElementById('gta-overlay-subtitle');

    document.body.classList.remove('overworked-mode', 'writtenup-mode');

    if (type === 'overworked') {
      this.audio.playSFX('wasted');
      document.body.classList.add('overworked-mode');
      if (titleEl) {
        titleEl.textContent = '過勞昏倒 (OVERWORKED)';
        titleEl.style.color = '#ef476f';
      }
      if (subEl) subEl.textContent = `肝指數突破上限！累積破壞：$${this.totalDamageCash.toLocaleString()}`;
    } else if (type === 'busted') {
      this.audio.playSFX('busted');
      document.body.classList.add('writtenup-mode');
      if (titleEl) {
        titleEl.textContent = '記大過處分 (WRITTEN UP)';
        titleEl.style.color = '#38bdf8';
      }
      if (subEl) subEl.textContent = `遭政風處與保全團團包圍！累積破壞：$${this.totalDamageCash.toLocaleString()}`;
    } else {
      this.audio.playSFX('mission_passed');
      if (titleEl) {
        titleEl.textContent = '準時下班 (MISSION PASSED! RESPECT +)';
        titleEl.style.color = '#ffd166';
      }
      if (subEl) subEl.textContent = `恭喜完成限時惡搞挑戰！獲得 $50,000 破壞津貼！`;
    }

    if (screen) screen.classList.add('show');
  }

  respawnAndContinue() {
    this.settlementState = null;
    this.timeScale = 1.0;
    this.player.health = 100;
    this.wantedStars = 0;
    this.wantedPoints = 0;
    this.stealthTimer = 0;
    this.npcManager.clearAllEnforcement();
    this.updateWantedHUD(false);

    const bar = document.getElementById('hp-bar-fill');
    if (bar) bar.style.width = '100%';
    document.body.classList.remove('overworked-mode', 'writtenup-mode');

    const screen = document.getElementById('gta-overlay');
    if (screen) screen.classList.remove('show');
    const stealthPill = document.getElementById('stealth-status-pill');
    if (stealthPill) stealthPill.classList.remove('active');
  }

  spawnFloatingPopup(worldPos, text, color = '#ffbe0b') {
    if (!this.floatingLabels || !worldPos) return;
    const v = new THREE.Vector3(worldPos.x, (worldPos.y || 1) + 1.2, worldPos.z);
    v.project(this.camera);
    if (v.z > 1) return;

    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;

    const el = document.createElement('div');
    el.className = 'floating-popup';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = color;
    el.textContent = text;
    this.floatingLabels.appendChild(el);
    setTimeout(() => el.remove(), 1250);
  }

  showComboBanner(text) {
    const banner = document.getElementById('combo-banner');
    if (!banner) return;
    banner.textContent = text;
    banner.classList.add('show');
    clearTimeout(this.bannerTimeout);
    this.bannerTimeout = setTimeout(() => banner.classList.remove('show'), 2800);
  }

  // Bottom-Left Circular GTA Radar Minimap with Enforcement Vision Cones!
  drawRadarMinimap() {
    if (!this.radarCtx || !this.radarCanvas) return;
    const ctx = this.radarCtx;
    const W = this.radarCanvas.width;
    const H = this.radarCanvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const scale = 2.05; // pixels per world meter

    const activePos = this.getActivePosition();
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    ctx.translate(cx, cy);

    // Draw Indoor Hall boundary (x: -29..29, z: -34..6)
    ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.fillRect((-29 - activePos.x) * scale, (-34 - activePos.z) * scale, 58 * scale, 40 * scale);
    ctx.strokeRect((-29 - activePos.x) * scale, (-34 - activePos.z) * scale, 58 * scale, 40 * scale);

    // Draw Pantry Safe Stealth Zone (茶水間死角)
    const pz = this.gameWorld.pantryZone;
    ctx.fillStyle = 'rgba(34, 211, 238, 0.25)';
    ctx.fillRect(
      (pz.minX - activePos.x) * scale,
      (pz.minZ - activePos.z) * scale,
      (pz.maxX - pz.minX) * scale,
      (pz.maxZ - pz.minZ) * scale
    );

    // Draw Water Puddles
    for (const p of this.gameWorld.puddles) {
      ctx.beginPath();
      ctx.arc((p.x - activePos.x) * scale, (p.z - activePos.z) * scale, p.radius * scale, 0, Math.PI * 2);
      ctx.fillStyle = p.electrified ? 'rgba(250, 204, 21, 0.55)' : 'rgba(0, 180, 216, 0.45)';
      ctx.fill();
    }

    // Draw Side-Mission Coronas
    for (const m of this.gameWorld.missionRings) {
      ctx.beginPath();
      ctx.arc((m.x - activePos.x) * scale, (m.z - activePos.z) * scale, 5.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#' + m.color.toString(16).padStart(6, '0');
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Draw Vehicles
    for (const v of this.vehicleManager.vehicles) {
      const vx = (v.body.position.x - activePos.x) * scale;
      const vz = (v.body.position.z - activePos.z) * scale;
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(vx - 3.5, vz - 3.5, 7, 7);
    }

    // Draw NPCs & Enforcement Vision Cones (追兵扇形視野錐)
    for (const npc of this.npcManager.npcs) {
      if (npc.knockedDown) continue;
      const nx = (npc.body.position.x - activePos.x) * scale;
      const nz = (npc.body.position.z - activePos.z) * scale;

      if (npc.isEnforcement) {
        const coneAngle = Math.atan2(Math.cos(npc.yaw), Math.sin(npc.yaw));
        ctx.beginPath();
        ctx.moveTo(nx, nz);
        ctx.arc(nx, nz, 14.5 * scale, coneAngle - 0.62, coneAngle + 0.62);
        ctx.closePath();
        ctx.fillStyle = 'rgba(239, 68, 68, 0.28)';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(nx, nz, npc.isEnforcement ? 3.8 : 2.8, 0, Math.PI * 2);
      ctx.fillStyle = npc.isEnforcement ? '#ef4444' : npc.role === 'supervisor' ? '#f59e0b' : '#94a3b8';
      ctx.fill();
    }

    // Draw Player Triangle at Center
    const activeYaw = this.vehicleManager.currentVehicle ? this.vehicleManager.currentVehicle.yaw : this.player.yaw;
    ctx.save();
    ctx.rotate(-activeYaw + Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.lineTo(5, 5.5);
    ctx.lineTo(-5, 5.5);
    ctx.closePath();
    ctx.fillStyle = '#22c55e';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    // 更新室內外區域標籤
    const zoneTag = document.getElementById('zone-indicator');
    if (zoneTag) {
      if (
        activePos.x >= pz.minX && activePos.x <= pz.maxX &&
        activePos.z >= pz.minZ && activePos.z <= pz.maxZ
      ) {
        zoneTag.textContent = '🕵️ 茶水間消星死角';
      } else if (activePos.z < 6 && Math.abs(activePos.x) <= 28) {
        zoneTag.textContent = '🏢 室內營業大廳';
      } else {
        zoneTag.textContent = '🚜 戶外工務材料場';
      }
    }
  }

  animate(now) {
    requestAnimationFrame((t) => this.animate(t));

    const rawDt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    // Bullet-Time 0.2x when Weapon Wheel is open, or Slow-Mo during Settlement!
    const targetScale = this.settlementState ? 0.22 : this.weaponSystem.wheelOpen ? 0.2 : 1.0;
    this.timeScale += (targetScale - this.timeScale) * 0.25;
    const dt = rawDt * this.timeScale;

    // Step Physics World
    this.physicsWorld.step(1 / 60, dt, 3);

    const isDriving = Boolean(this.vehicleManager.currentVehicle);
    const activePos = this.getActivePosition();

    // Update Player when on foot
    if (!isDriving && !this.settlementState) {
      const moveX = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0) + this.input.joyX;
      const moveZ = (this.input.backward ? 1 : 0) - (this.input.forward ? 1 : 0) + this.input.joyY;
      const moveLen = Math.hypot(moveX, moveZ);

      // Check if standing on a slippery water puddle
      let onSlipperyPuddle = false;
      for (const p of this.gameWorld.puddles) {
        if (Math.hypot(this.player.body.position.x - p.x, this.player.body.position.z - p.z) <= p.radius) {
          onSlipperyPuddle = true;
          break;
        }
      }

      const speedBoost = this.player.caffeineTimer > 0 ? 1.85 : 1.0;
      const baseSpeed = 9.5 * speedBoost;

      if (moveLen > 0.05) {
        const nx = moveX / moveLen;
        const nz = moveZ / moveLen;
        const accelBlend = onSlipperyPuddle ? 0.08 : 0.35;
        this.player.body.velocity.x += (nx * baseSpeed - this.player.body.velocity.x) * accelBlend;
        this.player.body.velocity.z += (nz * baseSpeed - this.player.body.velocity.z) * accelBlend;
        this.player.yaw = Math.atan2(nx, nz);
      } else if (!onSlipperyPuddle) {
        this.player.body.velocity.x *= 0.78;
        this.player.body.velocity.z *= 0.78;
      }

      if (this.input.attack) {
        this.weaponSystem.fireWeapon(this.player, this.npcManager);
      }

      // Caffeine Overclock 6-second countdown & Golden Lightning Aura
      if (this.player.caffeineTimer > 0) {
        this.player.caffeineTimer = Math.max(0, this.player.caffeineTimer - rawDt);
        this.caffeineAura.visible = true;
        this.caffeineAura.rotation.y += rawDt * 12;
        this.caffeineAura.rotation.x += rawDt * 8;
      } else {
        this.caffeineAura.visible = false;
      }
      const cafBar = document.getElementById('caffeine-bar-fill');
      if (cafBar) cafBar.style.width = `${(this.player.caffeineTimer / 6.0) * 100}%`;

      // Arm swing & leg walk animations
      if (this.player.swingAnimTimer > 0) {
        this.player.swingAnimTimer -= dt;
        this.rightArmGroup.rotation.x = -Math.sin(this.player.swingAnimTimer * 18) * 1.6;
      } else {
        this.rightArmGroup.rotation.x = 0;
      }

      const pSpd = Math.hypot(this.player.body.velocity.x, this.player.body.velocity.z);
      if (pSpd > 0.8) {
        const legSwing = Math.sin(now * 0.015) * 0.55;
        this.playerLeftLeg.rotation.x = legSwing;
        this.playerRightLeg.rotation.x = -legSwing;
      } else {
        this.playerLeftLeg.rotation.x = 0;
        this.playerRightLeg.rotation.x = 0;
      }

      this.player.mesh.position.copy(this.player.body.position);
      this.player.mesh.rotation.y = this.player.yaw;
    }

    // 檢查附近可搶奪載具與支線光圈提示
    const promptEl = document.getElementById('interaction-prompt');
    if (promptEl) {
      if (!isDriving) {
        const nearCar = this.vehicleManager.findNearestVehicle(this.player.body.position, 4.4);
        const nearMission = this.gameWorld.missionRings.find(
          (m) => Math.hypot(this.player.body.position.x - m.x, this.player.body.position.z - m.z) < 2.9
        );

        if (nearMission && !this.activeMission) {
          this.startSideMission(nearMission);
        }

        if (nearCar) {
          promptEl.classList.add('show');
          promptEl.innerHTML = `按 <span class="key-pill">F</span> 搶奪駕駛：${nearCar.name}`;
        } else {
          promptEl.classList.remove('show');
        }
      } else {
        promptEl.classList.remove('show');
      }
    }

    // 更新支線挑戰倒數計時
    if (this.activeMission && !this.settlementState) {
      this.activeMission.timeLeft -= rawDt;
      this.updateMissionHUD();
      if (this.activeMission.timeLeft <= 0) {
        this.showComboBanner('⏰ 支線挑戰時間到！可再次踩入光圈重試！');
        this.activeMission = null;
        const banner = document.getElementById('mission-banner');
        if (banner) banner.classList.remove('active');
      }
    }

    // 潛行消星機制（逃出追兵扇形視野錐維持 8 秒即可消星）
    const stealthPill = document.getElementById('stealth-status-pill');
    if (this.wantedStars > 0 && !this.settlementState) {
      const spotted = this.npcManager.isPlayerSpottedByEnforcement(activePos);
      if (!spotted) {
        this.stealthTimer += rawDt;
        this.updateWantedHUD(true);
        const remain = Math.max(0, 8.0 - this.stealthTimer);
        if (stealthPill) {
          stealthPill.classList.add('active');
          stealthPill.textContent = `🕵️ 消星：${remain.toFixed(1)}s`;
        }

        if (this.stealthTimer >= 8.0) {
          this.wantedStars = 0;
          this.wantedPoints = 0;
          this.stealthTimer = 0;
          this.npcManager.clearAllEnforcement();
          this.updateWantedHUD(false);
          if (stealthPill) stealthPill.classList.remove('active');
          this.audio.playSFX('caffeine_boost');
          this.showComboBanner('🕵️ 潛行躲藏成功！通緝星等已全部消除！');
        }
      } else {
        this.stealthTimer = Math.max(0, this.stealthTimer - rawDt * 2.0);
        this.updateWantedHUD(false);
        if (stealthPill) stealthPill.classList.remove('active');
      }
    } else if (stealthPill) {
      stealthPill.classList.remove('active');
    }

    // 更新各子系統
    this.gameWorld.update(dt, this.npcManager, this.wantedStars);
    this.vehicleManager.update(dt, this.input, this.npcManager, this.mouseYaw);
    this.weaponSystem.update(dt, this.player, this.npcManager, isDriving);
    this.npcManager.update(dt, this.player, this.wantedStars, isDriving);
    this.audio.update(rawDt, isDriving);

    // 第三人稱攝影機跟隨主角後上方 (0, 12, 14)，避免被天花板或牆壁遮擋
    const camDist = this.settlementState ? 20 : isDriving ? 17 : 14;
    const camHeight = this.settlementState ? 15 : isDriving ? 13 : 12;
    const targetCamX = activePos.x;
    const targetCamY = activePos.y + camHeight;
    const targetCamZ = activePos.z + camDist;

    this.camera.position.x += (targetCamX - this.camera.position.x) * 0.14;
    this.camera.position.y += (targetCamY - this.camera.position.y) * 0.14;
    this.camera.position.z += (targetCamZ - this.camera.position.z) * 0.14;
    this.camera.lookAt(activePos.x, activePos.y + 0.8, activePos.z);

    this.drawRadarMinimap();
    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.gameApp = new GrandTheftWaterCorpApp();
});
