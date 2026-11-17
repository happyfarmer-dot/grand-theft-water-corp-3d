// js/npc.js
// 一般同事、主管（含可噴飛假髮與退件公文）與 1～5 星通緝執法單位 AI、動態表情與對話氣泡

import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const COLLEAGUE_QUOTES = [
  '我的 AutoCAD 還沒存檔啊！',
  '別砸我的螢幕！',
  '誰把減壓閥轉開了！',
  '這是公家車你不能開走！',
  '救命啊！茶水間漏電啦！',
  '我只是來領加班費的啊！'
];

const SUPERVISOR_QUOTES = [
  '連這點水壓都算不好？退件重寫！',
  '造反啦！扣你今年考績獎金！',
  '看我的《急件退回公文》攻擊！',
  '政風處！快把這個人抓起來記大過！'
];

export class NPCManager {
  constructor(scene, physicsWorld, audio, gameWorld, camera, callbacks = {}) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;
    this.audio = audio;
    this.gameWorld = gameWorld;
    this.camera = camera;
    this.callbacks = callbacks; // { onDamageAdded, onPopup, onBossDunked, onPlayerDamaged, onPlayerBusted }

    this.npcs = [];
    this.flyingWigs = [];
    this.docProjectiles = [];
    this.floatingContainer = document.getElementById('floating-labels');

    this.faceTextures = {
      sleep: this.createFaceTexture('sleep'),
      normal: this.createFaceTexture('normal'),
      shock: this.createFaceTexture('shock'),
      angry: this.createFaceTexture('angry'),
      dizzy: this.createFaceTexture('dizzy')
    };

    this.enforcementSpawnTimer = 0;
    this.arrestExposureTimer = 0;

    this.spawnInitialOfficeStaff();
  }

  createFaceTexture(mood) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(0, 0, 128, 128);

    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 5;
    ctx.textAlign = 'center';

    if (mood === 'sleep') {
      ctx.font = '900 32px sans-serif';
      ctx.fillText('—  —', 64, 62);
      ctx.fillStyle = '#0284c7';
      ctx.font = '900 26px monospace';
      ctx.fillText('Zzz', 92, 34);
    } else if (mood === 'shock') {
      ctx.font = '900 36px monospace';
      ctx.fillText('O _ O', 64, 68);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(98, 36, 8, 22);
    } else if (mood === 'angry') {
      ctx.font = '900 34px sans-serif';
      ctx.fillText('💢 > <', 64, 65);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(42, 85, 44, 10);
    } else if (mood === 'dizzy') {
      ctx.font = '900 34px monospace';
      ctx.fillText('@ _ @', 64, 68);
    } else {
      ctx.font = '900 34px sans-serif';
      ctx.fillText('•  •', 64, 60);
      ctx.fillRect(48, 84, 32, 6);
    }
    return new THREE.CanvasTexture(c);
  }

  spawnInitialOfficeStaff() {
    // 10 Colleagues working / dozing at cubicles
    const colleagueCoords = [
      [-6, -24], [3, -24], [12, -24], [21, -24],
      [-6, -16], [3, -16], [12, -16], [21, -16],
      [-10, -8], [15, -8]
    ];
    colleagueCoords.forEach(([x, z], i) => {
      this.spawnNPC({
        role: 'colleague',
        name: `工程員同仁 #${i + 1}`,
        x,
        z,
        shirtColor: i % 2 === 0 ? 0xe0f2fe : 0xf1f5f9,
        mood: i % 3 === 0 ? 'sleep' : 'normal'
      });
    });

    // 5 Angry Supervisors (科長/主任) with detachable Wigs!
    const bossCoords = [
      [0, -12, '營業課王科長'],
      [10, -20, '工務課陳主任'],
      [-16, -12, '政風室李督導'],
      [8, 12, '稽查組張課長'],
      [18, 25, '給水廠林廠長']
    ];
    bossCoords.forEach(([x, z, name]) => {
      this.spawnNPC({
        role: 'supervisor',
        name,
        x,
        z,
        shirtColor: 0x1e293b,
        mood: 'angry',
        hasWig: true
      });
    });
  }

  spawnNPC(cfg) {
    const group = new THREE.Group();

    // Torso
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.78, 0.36),
      new THREE.MeshStandardMaterial({ color: cfg.shirtColor || 0xe2e8f0, roughness: 0.6 })
    );
    torso.position.y = 0.1;
    torso.castShadow = true;
    group.add(torso);

    // Red tie for supervisors & inspectors
    if (cfg.role === 'supervisor' || cfg.starLevel >= 4) {
      const tie = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.45, 0.05),
        new THREE.MeshBasicMaterial({ color: 0xdc2626 })
      );
      tie.position.set(0, 0.15, 0.19);
      group.add(tie);
    }

    // Legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6, 0.24), legMat);
    leftLeg.position.set(-0.15, -0.55, 0);
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6, 0.24), legMat);
    rightLeg.position.set(0.15, -0.55, 0);
    group.add(leftLeg, rightLeg);

    // Head with dynamic CanvasTexture expression
    const headMats = [
      new THREE.MeshStandardMaterial({ color: 0xfde68a }),
      new THREE.MeshStandardMaterial({ color: 0xfde68a }),
      new THREE.MeshStandardMaterial({ color: 0xfde68a }),
      new THREE.MeshStandardMaterial({ color: 0xfde68a }),
      new THREE.MeshBasicMaterial({ map: this.faceTextures[cfg.mood || 'normal'] }),
      new THREE.MeshStandardMaterial({ color: 0xfde68a })
    ];
    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), headMats);
    headMesh.position.y = 0.76;
    headMesh.castShadow = true;
    group.add(headMesh);

    // Detachable Supervisor Wig (主管假髮) or Enforcement Helmet
    let wigMesh = null;
    if (cfg.hasWig) {
      wigMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.22, 0.58),
        new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.9 })
      );
      wigMesh.position.set(0, 1.06, 0.02);
      group.add(wigMesh);
    } else if (cfg.isEnforcement) {
      const helmetColor = cfg.starLevel >= 5 ? 0xfacc15 : cfg.starLevel >= 2 ? 0x0284c7 : 0x16a34a;
      const helmet = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.34, 0.22, 10),
        new THREE.MeshStandardMaterial({ color: helmetColor })
      );
      helmet.position.y = 1.06;
      group.add(helmet);
    }

    const startY = cfg.dropFromSky ? 18.0 : 0.95;
    group.position.set(cfg.x, startY, cfg.z);
    this.scene.add(group);

    const body = new CANNON.Body({
      mass: 55,
      shape: new CANNON.Box(new CANNON.Vec3(0.38, 0.85, 0.38)),
      position: new CANNON.Vec3(cfg.x, startY, cfg.z),
      linearDamping: 0.4,
      angularDamping: 0.7
    });
    body.angularFactor.set(0, 1, 0);
    this.physicsWorld.addBody(body);

    // DOM Speech Bubble element
    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'npc-bubble';
    bubbleEl.style.display = 'none';
    if (this.floatingContainer) this.floatingContainer.appendChild(bubbleEl);

    const npc = {
      ...cfg,
      mesh: group,
      headMesh,
      wigMesh,
      leftLeg,
      rightLeg,
      body,
      yaw: Math.random() * Math.PI * 2,
      knockedDown: false,
      recoverTimer: 0,
      panicTimer: 0,
      electrocutedTimer: 0,
      docThrowTimer: 1.5 + Math.random() * 2.5,
      bubbleEl,
      bubbleTimer: 0,
      isCarried: false,
      countedInPool: false,
      setExpression: (mood) => {
        if (this.faceTextures[mood]) {
          headMesh.material[4].map = this.faceTextures[mood];
          headMesh.material[4].needsUpdate = true;
        }
      }
    };

    this.npcs.push(npc);
    return npc;
  }

  showBubble(npc, text, urgent = false) {
    if (!npc || !npc.bubbleEl) return;
    npc.bubbleEl.textContent = text;
    npc.bubbleEl.classList.toggle('urgent', urgent);
    npc.bubbleEl.style.display = 'block';
    npc.bubbleTimer = 3.2;
  }

  popSupervisorWig(npc) {
    if (!npc || !npc.hasWig || !npc.wigMesh) return;
    npc.hasWig = false;
    npc.mesh.remove(npc.wigMesh);

    const worldWig = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.24, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x18181b })
    );
    worldWig.position.copy(npc.body.position);
    worldWig.position.y += 1.2;
    this.scene.add(worldWig);

    this.flyingWigs.push({
      mesh: worldWig,
      vx: (Math.random() - 0.5) * 10,
      vy: 11 + Math.random() * 5,
      vz: (Math.random() - 0.5) * 10,
      life: 4.5
    });

    npc.setExpression('shock');
    this.showBubble(npc, '啊！我的假髮飛走了！這頂要三萬塊耶！', true);
    if (this.callbacks.onPopup) {
      this.callbacks.onPopup(npc.body.position, '💇‍♂️ 沖飛主管假髮！+$5,000', '#ffbe0b');
    }
    if (this.callbacks.onDamageAdded) {
      this.callbacks.onDamageAdded(5000, '沖飛主管假髮', npc.body.position);
    }
  }

  knockdownNPC(npc, quote = null, fromBossAction = false) {
    if (!npc) return;
    if (!npc.knockedDown) {
      npc.knockedDown = true;
      npc.recoverTimer = 5.5;
      npc.setExpression('dizzy');
      npc.body.angularFactor.set(1, 1, 1);
      npc.body.angularVelocity.set((Math.random() - 0.5) * 8, 2, (Math.random() - 0.5) * 8);

      const line = quote || (npc.role === 'supervisor'
        ? SUPERVISOR_QUOTES[Math.floor(Math.random() * SUPERVISOR_QUOTES.length)]
        : COLLEAGUE_QUOTES[Math.floor(Math.random() * COLLEAGUE_QUOTES.length)]);
      this.showBubble(npc, line, true);

      if (this.callbacks.onDamageAdded) {
        this.callbacks.onDamageAdded(npc.role === 'supervisor' ? 4500 : 2000, `擊倒 ${npc.name}`, npc.body.position);
      }
      if (npc.role === 'supervisor' && fromBossAction && this.callbacks.onBossDunked && !npc.countedInPool) {
        npc.countedInPool = true;
        this.callbacks.onBossDunked(npc);
      }
    }
  }

  findNearestNPC(x, z, maxDist = 4.0) {
    let best = null;
    let bestDist = maxDist;
    for (const npc of this.npcs) {
      const d = Math.hypot(npc.body.position.x - x, npc.body.position.z - z);
      if (d < bestDist) {
        bestDist = d;
        best = npc;
      }
    }
    return best;
  }

  hitSingleNPCAt(x, z, radius, force, quote) {
    for (const npc of this.npcs) {
      const d = Math.hypot(npc.body.position.x - x, npc.body.position.z - z);
      if (d <= radius) {
        this.knockdownNPC(npc, quote);
        npc.body.velocity.y = 4.5;
        return true;
      }
    }
    return false;
  }

  hitNPCsInCone(ox, oz, dirX, dirZ, range, force, quote) {
    for (const npc of this.npcs) {
      const dx = npc.body.position.x - ox;
      const dz = npc.body.position.z - oz;
      const dist = Math.hypot(dx, dz);
      if (dist <= range) {
        const dot = (dx / (dist || 1)) * dirX + (dz / (dist || 1)) * dirZ;
        if (dot > 0.2 || dist < 1.8) {
          npc.body.velocity.set(dirX * force, 6.0, dirZ * force);
          this.knockdownNPC(npc, quote, force >= 18);
        }
      }
    }
  }

  blastNPCsAlongRay(ox, oz, dirX, dirZ, maxRange, width = 2.6, popWig = true) {
    for (const npc of this.npcs) {
      const dx = npc.body.position.x - ox;
      const dz = npc.body.position.z - oz;
      const proj = dx * dirX + dz * dirZ;
      const perp = Math.abs(dx * dirZ - dz * dirX);
      if (proj > 0 && proj <= maxRange && perp <= width) {
        if (popWig && npc.hasWig) {
          this.popSupervisorWig(npc);
        }
        npc.body.velocity.set(dirX * 16, 5.5, dirZ * 16);
        this.knockdownNPC(npc, '哇啊！水壓太強啦！誰把減壓閥轉開了！', true);
      }
    }
  }

  scaldNPCsInCone(ox, oz, dirX, dirZ, range) {
    for (const npc of this.npcs) {
      const dx = npc.body.position.x - ox;
      const dz = npc.body.position.z - oz;
      const dist = Math.hypot(dx, dz);
      if (dist <= range) {
        npc.panicTimer = 6.0;
        npc.setExpression('shock');
        this.showBubble(npc, '好燙！這是滾燙特濃美式咖啡啊！', true);
        if (this.callbacks.onDamageAdded) {
          this.callbacks.onDamageAdded(2500, '熱咖啡燙傷驚慌', npc.body.position);
        }
      }
    }
  }

  electrocuteNPCsInRadius(cx, cz, radius) {
    for (const npc of this.npcs) {
      const dist = Math.hypot(npc.body.position.x - cx, npc.body.position.z - cz);
      if (dist <= radius && npc.electrocutedTimer <= 0) {
        npc.electrocutedTimer = 5.5;
        npc.setExpression('dizzy');
        this.knockdownNPC(npc, '⚡ 救命啊！茶水間水灘漏電啦！@_@', true);
        npc.body.velocity.y = 5.5;
      }
    }
  }

  explodeNPCsInRadius(cx, cz, radius) {
    for (const npc of this.npcs) {
      const dx = npc.body.position.x - cx;
      const dz = npc.body.position.z - cz;
      const dist = Math.hypot(dx, dz);
      if (dist <= radius) {
        const len = dist || 1;
        if (npc.hasWig) this.popSupervisorWig(npc);
        npc.body.velocity.set((dx / len) * 18, 9.5, (dz / len) * 18);
        this.knockdownNPC(npc, '我的 AutoCAD 還沒存檔啊！', true);
      }
    }
  }

  crushNPCsByPipe(pipePos, radius, halfLen) {
    for (const npc of this.npcs) {
      if (!npc.knockedDown) {
        const dx = Math.abs(npc.body.position.x - pipePos.x);
        const dz = Math.abs(npc.body.position.z - pipePos.z);
        if (dx < halfLen && dz < radius) {
          npc.mesh.scale.y = 0.28; // Flattened by giant blue PVC pipe!
          this.knockdownNPC(npc, '扁掉啦！PVC 輸水管滾過來啦！', true);
          if (this.callbacks.onPopup) {
            this.callbacks.onPopup(npc.body.position, '🟦 巨型 PVC 輸水管滾動壓扁追兵！+$4,500', '#38bdf8');
          }
        }
      }
    }
  }

  ramNPCsByVehicle(vehicle, hitRadius, speed) {
    let count = 0;
    for (const npc of this.npcs) {
      if (npc.isCarried || npc.knockedDown) continue;
      const dx = npc.body.position.x - vehicle.body.position.x;
      const dz = npc.body.position.z - vehicle.body.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= hitRadius) {
        if (vehicle.type === 'forklift' && !vehicle.carriedNPC && npc.role === 'supervisor') {
          vehicle.carriedNPC = npc;
          npc.isCarried = true;
          vehicle.forkHeight = 1.65;
          npc.setExpression('shock');
          this.showBubble(npc, '快放我下來！這是公家堆高機！', true);
          if (this.callbacks.onPopup) {
            this.callbacks.onPopup(npc.body.position, '🚜 堆高機自動鏟起主管！按 [E] 甩飛！', '#ffbe0b');
          }
        } else {
          const len = dist || 1;
          npc.body.velocity.set((dx / len) * speed * 1.35, 7.5, (dz / len) * speed * 1.35);
          this.knockdownNPC(npc, '這是公家車你不能這樣撞人啊！', true);
          count++;
        }
      }
    }
    return count;
  }

  // Throw Red Rejected Document Missile (紅色退件公文飛彈)
  spawnRejectedDocProjectile(npc, targetPos) {
    const dx = targetPos.x - npc.body.position.x;
    const dz = targetPos.z - npc.body.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    const speed = npc.starLevel >= 4 ? 14.5 : 11.5;

    const docGroup = new THREE.Group();
    const folder = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.12, 0.72),
      new THREE.MeshBasicMaterial({ color: 0xff2a54 })
    );
    docGroup.add(folder);
    docGroup.position.set(npc.body.position.x, npc.body.position.y + 0.8, npc.body.position.z);
    this.scene.add(docGroup);

    this.docProjectiles.push({
      mesh: docGroup,
      sender: npc,
      x: docGroup.position.x,
      y: docGroup.position.y,
      z: docGroup.position.z,
      vx: (dx / dist) * speed,
      vz: (dz / dist) * speed,
      reflected: false,
      life: 4.0
    });
  }

  // Pipe Wrench Baseball Home-Run Counter (大號管鉗全壘打反擊退件公文！)
  reflectIncomingDocuments(playerPos, dirX, dirZ, radius = 4.8) {
    let reflectedAny = false;
    for (const doc of this.docProjectiles) {
      if (!doc.reflected) {
        const d = Math.hypot(doc.x - playerPos.x, doc.z - playerPos.z);
        if (d <= radius) {
          doc.reflected = true;
          doc.life = 3.0;
          doc.mesh.children[0].material.color.setHex(0xffbe0b);
          if (doc.sender && !doc.sender.knockedDown) {
            const sx = doc.sender.body.position.x - doc.x;
            const sz = doc.sender.body.position.z - doc.z;
            const slen = Math.hypot(sx, sz) || 1;
            doc.vx = (sx / slen) * 28;
            doc.vz = (sz / slen) * 28;
          } else {
            doc.vx = dirX * 28;
            doc.vz = dirZ * 28;
          }
          reflectedAny = true;
        }
      }
    }
    return reflectedAny;
  }

  // Spawn 1~5 Star Wanted Enforcement Squads
  spawnEnforcementForStar(starLevel, playerPos) {
    const activeEnforcers = this.npcs.filter((n) => n.isEnforcement && !n.knockedDown).length;
    const maxAllowed = Math.min(10, starLevel * 2 + 1);
    if (activeEnforcers >= maxAllowed) return;

    const unitConfigs = {
      1: { name: '★1 總務組人員 (雞毛撢子)', color: 0x16a34a, drop: false, quote: '總務組警告！不准破壞公物！' },
      2: { name: '★★2 保全與政風處 (電擊棒)', color: 0x0284c7, drop: false, quote: '政風處出動！放下武器束手就擒！' },
      3: { name: '★★★3 工務搶修班 (高壓水槍)', color: 0xea580c, drop: false, quote: '工務搶修班封鎖現場！啟動高壓水柱！' },
      4: { name: '★★★★4 總處黑衣督導 (空降公文飛彈)', color: 0x090d16, drop: true, quote: '總處督導組空降！吃我的紅色退件公文飛彈！' },
      5: { name: '★★★★★5 防汛特勤隊 (全館超壓爆管)', color: 0x7c3aed, drop: true, quote: '防汛特勤隊全員出擊！全館供水總閥超壓！' }
    };

    const cfg = unitConfigs[starLevel] || unitConfigs[1];
    const angle = Math.random() * Math.PI * 2;
    const dist = 12 + Math.random() * 8;
    const sx = Math.max(-26, Math.min(26, playerPos.x + Math.cos(angle) * dist));
    const sz = Math.max(-28, Math.min(42, playerPos.z + Math.sin(angle) * dist));

    const unit = this.spawnNPC({
      role: 'enforcement',
      isEnforcement: true,
      starLevel,
      name: cfg.name,
      x: sx,
      z: sz,
      shirtColor: cfg.color,
      mood: 'angry',
      dropFromSky: cfg.drop
    });
    this.showBubble(unit, cfg.quote, true);
  }

  // Check if player is inside ANY enforcement unit's Vision Cone (扇形視野錐)
  isPlayerSpottedByEnforcement(playerPos) {
    // If player is hiding inside the Pantry blind spot (茶水間死角), walls block line of sight unless guard is also inside pantry!
    const pZone = this.gameWorld.pantryZone;
    const playerInPantry =
      playerPos.x >= pZone.minX && playerPos.x <= pZone.maxX &&
      playerPos.z >= pZone.minZ && playerPos.z <= pZone.maxZ;

    for (const npc of this.npcs) {
      if (!npc.isEnforcement || npc.knockedDown || npc.electrocutedTimer > 0) continue;

      const gx = npc.body.position.x;
      const gz = npc.body.position.z;
      const guardInPantry =
        gx >= pZone.minX && gx <= pZone.maxX &&
        gz >= pZone.minZ && gz <= pZone.maxZ;

      if (playerInPantry && !guardInPantry) continue;

      const dx = playerPos.x - gx;
      const dz = playerPos.z - gz;
      const dist = Math.hypot(dx, dz);
      const visionRange = 14.5;
      if (dist <= visionRange) {
        const forwardX = Math.sin(npc.yaw);
        const forwardZ = Math.cos(npc.yaw);
        const dot = (dx / (dist || 1)) * forwardX + (dz / (dist || 1)) * forwardZ;
        if (dot >= Math.cos((38 * Math.PI) / 180) || dist < 3.0) {
          return true;
        }
      }
    }
    return false;
  }

  clearAllEnforcement() {
    for (const npc of this.npcs) {
      if (npc.isEnforcement) {
        npc.isEnforcement = false;
        npc.role = 'colleague';
        npc.setExpression('normal');
        this.showBubble(npc, '人跑哪去了？收隊下班囉！', false);
      }
    }
  }

  update(dt, player, wantedStars, isDriving) {
    const pPos = player.body.position;

    // Spawn enforcement units when wantedStars > 0
    if (wantedStars > 0) {
      this.enforcementSpawnTimer += dt;
      if (this.enforcementSpawnTimer >= 3.2) {
        this.enforcementSpawnTimer = 0;
        this.spawnEnforcementForStar(wantedStars, pPos);
      }
    }

    let closeGuardsCount = 0;
    const pool = this.gameWorld.waterPoolZone;

    for (const npc of this.npcs) {
      // Check if Supervisor landed in the outdoor water pool!
      if (npc.role === 'supervisor' && !npc.countedInPool) {
        const distToPool = Math.hypot(npc.body.position.x - pool.x, npc.body.position.z - pool.z);
        if (distToPool <= pool.radius) {
          npc.countedInPool = true;
          this.audio.playSFX('splash');
          this.showBubble(npc, '咕嚕咕嚕...誰把我鏟進蓄水池的！', true);
          if (this.callbacks.onPopup) {
            this.callbacks.onPopup(npc.body.position, '🌊 主管落水清涼大成功！+$15,000', '#00e5ff');
          }
          if (this.callbacks.onBossDunked) {
            this.callbacks.onBossDunked(npc);
          }
        }
      }

      if (npc.isCarried) {
        npc.mesh.position.copy(npc.body.position);
        this.updateBubbleScreenPos(npc);
        continue;
      }

      if (npc.electrocutedTimer > 0) {
        npc.electrocutedTimer -= dt;
        npc.mesh.rotation.z = Math.sin(performance.now() * 0.05) * 0.35;
      }

      if (npc.knockedDown) {
        npc.recoverTimer -= dt;
        if (npc.recoverTimer <= 0 && npc.electrocutedTimer <= 0) {
          npc.knockedDown = false;
          npc.mesh.scale.y = 1.0;
          npc.body.angularFactor.set(0, 1, 0);
          npc.body.quaternion.setFromEuler(0, npc.yaw, 0);
          npc.setExpression(npc.role === 'supervisor' || npc.isEnforcement ? 'angry' : 'normal');
        }
      } else if (npc.panicTimer > 0) {
        // Scalded by hot coffee -> run around wildly!
        npc.panicTimer -= dt;
        npc.yaw += (Math.random() - 0.5) * 8 * dt;
        npc.body.velocity.x = Math.sin(npc.yaw) * 7.5;
        npc.body.velocity.z = Math.cos(npc.yaw) * 7.5;
        npc.body.quaternion.setFromEuler(0, npc.yaw, 0);
      } else if (npc.isEnforcement || npc.role === 'supervisor') {
        const dx = pPos.x - npc.body.position.x;
        const dz = pPos.z - npc.body.position.z;
        const dist = Math.hypot(dx, dz);

        // If player is inside Pantry and guard is outside, guard patrols instead of wall-hacking
        const pZone = this.gameWorld.pantryZone;
        const playerInPantry =
          pPos.x >= pZone.minX && pPos.x <= pZone.maxX &&
          pPos.z >= pZone.minZ && pPos.z <= pZone.maxZ;

        if (playerInPantry && dist > 4.5) {
          npc.yaw += dt * 0.85;
          npc.body.velocity.x = Math.sin(npc.yaw) * 2.5;
          npc.body.velocity.z = Math.cos(npc.yaw) * 2.5;
        } else if (dist < 24) {
          npc.yaw = Math.atan2(dx, dz);
          const chaseSpeed = npc.isEnforcement ? 4.8 + (npc.starLevel || 1) * 0.55 : 3.2;
          if (dist > 1.8) {
            npc.body.velocity.x = Math.sin(npc.yaw) * chaseSpeed;
            npc.body.velocity.z = Math.cos(npc.yaw) * chaseSpeed;
          } else if (npc.isEnforcement && !isDriving) {
            // Melee hit / arrest pressure on player
            if (npc.starLevel >= 2) closeGuardsCount++;
            if (Math.random() < 0.04 && this.callbacks.onPlayerDamaged) {
              this.callbacks.onPlayerDamaged(3.5);
            }
          }

          // Supervisors & 4-Star HQ Inspectors throw Red Rejected Document Missiles!
          if ((npc.role === 'supervisor' || npc.starLevel >= 4) && dist > 3.5 && dist < 17) {
            npc.docThrowTimer -= dt;
            if (npc.docThrowTimer <= 0) {
              npc.docThrowTimer = npc.starLevel >= 4 ? 2.4 : 3.8;
              this.spawnRejectedDocProjectile(npc, pPos);
            }
          }
        }
        npc.body.quaternion.setFromEuler(0, npc.yaw, 0);
      }

      // Walking leg swing animation
      const spd = Math.hypot(npc.body.velocity.x, npc.body.velocity.z);
      if (spd > 0.5 && !npc.knockedDown) {
        const swing = Math.sin(performance.now() * 0.012) * 0.45;
        npc.leftLeg.rotation.x = swing;
        npc.rightLeg.rotation.x = -swing;
      } else {
        npc.leftLeg.rotation.x = 0;
        npc.rightLeg.rotation.x = 0;
      }

      npc.mesh.position.copy(npc.body.position);
      npc.mesh.quaternion.copy(npc.body.quaternion);
      this.updateBubbleScreenPos(npc, dt);
    }

    // Check high-star arrest condition (WRITTEN UP / 記大過處分)
    if (wantedStars >= 2 && closeGuardsCount >= 2 && !isDriving) {
      this.arrestExposureTimer += dt;
      if (this.arrestExposureTimer >= 3.2 && this.callbacks.onPlayerBusted) {
        this.arrestExposureTimer = 0;
        this.callbacks.onPlayerBusted();
      }
    } else {
      this.arrestExposureTimer = Math.max(0, this.arrestExposureTimer - dt * 1.5);
    }

    // Update Flying Supervisor Wigs
    for (let i = this.flyingWigs.length - 1; i >= 0; i--) {
      const w = this.flyingWigs[i];
      w.life -= dt;
      w.vy -= 18 * dt;
      w.mesh.position.x += w.vx * dt;
      w.mesh.position.y += w.vy * dt;
      w.mesh.position.z += w.vz * dt;
      w.mesh.rotation.x += dt * 10;
      w.mesh.rotation.y += dt * 8;
      if (w.mesh.position.y < 0.15) {
        w.mesh.position.y = 0.15;
        w.vy *= -0.4;
      }
      if (w.life <= 0) {
        this.scene.remove(w.mesh);
        this.flyingWigs.splice(i, 1);
      }
    }

    // Update Rejected Document Projectiles
    for (let i = this.docProjectiles.length - 1; i >= 0; i--) {
      const doc = this.docProjectiles[i];
      doc.life -= dt;
      doc.x += doc.vx * dt;
      doc.z += doc.vz * dt;
      doc.mesh.position.set(doc.x, doc.y, doc.z);
      doc.mesh.rotation.y += dt * 12;

      if (doc.reflected) {
        // Reflected Home-Run missile hits any NPC or sender!
        const hitNPC = this.findNearestNPC(doc.x, doc.z, 1.8);
        if (hitNPC) {
          this.knockdownNPC(hitNPC, '哇啊！我退回的公文被全壘打打回來啦！', true);
          hitNPC.body.velocity.set(doc.vx * 0.8, 9, doc.vz * 0.8);
          this.scene.remove(doc.mesh);
          this.docProjectiles.splice(i, 1);
          continue;
        }
      } else {
        // Hits player if not reflected
        const dPlayer = Math.hypot(doc.x - pPos.x, doc.z - pPos.z);
        if (dPlayer < 1.1) {
          if (this.callbacks.onPlayerDamaged) this.callbacks.onPlayerDamaged(8);
          if (this.callbacks.onPopup) {
            this.callbacks.onPopup(pPos, '📕 被《退件公文》砸中！(可用2號大號管鉗揮擊反彈)', '#ff2a54');
          }
          this.scene.remove(doc.mesh);
          this.docProjectiles.splice(i, 1);
          continue;
        }
      }

      if (doc.life <= 0) {
        this.scene.remove(doc.mesh);
        this.docProjectiles.splice(i, 1);
      }
    }
  }

  updateBubbleScreenPos(npc, dt = 0.016) {
    if (!npc.bubbleEl || npc.bubbleTimer <= 0) return;
    npc.bubbleTimer -= dt;
    if (npc.bubbleTimer <= 0) {
      npc.bubbleEl.style.display = 'none';
      return;
    }

    const worldPos = new THREE.Vector3(
      npc.body.position.x,
      npc.body.position.y + 1.65,
      npc.body.position.z
    );
    worldPos.project(this.camera);

    if (worldPos.z > 1) {
      npc.bubbleEl.style.display = 'none';
      return;
    }

    const x = (worldPos.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-worldPos.y * 0.5 + 0.5) * window.innerHeight;
    npc.bubbleEl.style.display = 'block';
    npc.bubbleEl.style.left = `${x}px`;
    npc.bubbleEl.style.top = `${y}px`;
  }
}
