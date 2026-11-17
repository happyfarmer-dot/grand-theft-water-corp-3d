// js/weapons.js
// GTA 核心玩法 3：8 種惡搞武器、0.2x 子彈時間武器輪盤、前方 45 度扇形智慧鎖定與地面落點光圈

import * as THREE from 'three';

export const WEAPON_LIST = [
  {
    id: 0,
    name: '1. 空手格鬥與飛踢',
    shortName: '空手飛踢',
    icon: '🥊',
    desc: '衝刺移動時攻擊可使出「滑鏟飛踢」，撞翻整排同事與隔間！',
    cooldown: 0.32,
    range: 3.4,
    isRanged: false
  },
  {
    id: 1,
    name: '2. 大號管鉗 (全壘打反擊)',
    shortName: '大號管鉗',
    icon: '🔧',
    desc: '近戰重擊！抓準時機揮擊可將主管丟來的「紅色退件公文」全壘打反擊回去！',
    cooldown: 0.42,
    range: 4.0,
    isRanged: false
  },
  {
    id: 2,
    name: '3. 訂書機連發衝鋒槍',
    shortName: '訂書機衝鋒槍',
    icon: '📎',
    desc: '高射速連續發射訂書針，內建 45 度扇形智慧鎖定壓制敵人！',
    cooldown: 0.11,
    range: 20.0,
    isRanged: true
  },
  {
    id: 3,
    name: '4. 《給水申請書》紙片手榴彈',
    shortName: '申請書手榴彈',
    icon: '📄',
    desc: '投擲後延遲 2 秒炸開，爆出漫天飛舞的白色公文紙片與衝擊波！',
    cooldown: 0.85,
    range: 15.0,
    isRanged: true,
    showReticle: true
  },
  {
    id: 4,
    name: '5. 滾燙特濃美式咖啡壺',
    shortName: '滾燙美式咖啡',
    icon: '☕',
    desc: '左鍵潑灑熱咖啡讓敵人燙傷驚慌亂竄；按 [E] 喝下獲得 6 秒「咖啡因超頻」！',
    cooldown: 0.38,
    range: 7.5,
    isRanged: true
  },
  {
    id: 5,
    name: '6. 高壓消防水槍 (噴射飛行)',
    shortName: '高壓消防水槍',
    icon: '🚒',
    desc: '噴射藍色水柱沖飛敵人與主管假髮；跳躍時開火可實現「水壓噴射滯空飛行」！',
    cooldown: 0.08,
    range: 17.0,
    isRanged: true
  },
  {
    id: 6,
    name: '7. 遙控微波爐便當炸彈',
    shortName: '遙控微波爐C4',
    icon: '🍱',
    desc: '丟出迷你微波爐吸附於牆面或載具，按 [E] 發出「叮！」一聲引爆大範圍炸裂！',
    cooldown: 0.65,
    range: 14.0,
    isRanged: true,
    showReticle: true
  },
  {
    id: 7,
    name: '8. 高壓輸水幹管噴射砲',
    shortName: '幹管噴射砲',
    icon: '🌊',
    desc: '終極武器！發射巨型高壓水球，造成毀滅性範圍擊飛與瞬間淹水！',
    cooldown: 1.05,
    range: 22.0,
    isRanged: true,
    showReticle: true
  }
];

export class WeaponSystem {
  constructor(scene, audio, gameWorld, callbacks = {}) {
    this.scene = scene;
    this.audio = audio;
    this.gameWorld = gameWorld;
    this.callbacks = callbacks;

    this.currentIndex = 0;
    this.wheelOpen = false;
    this.hoveredIndex = 0;
    this.attackTimer = 0;

    this.projectiles = [];
    this.remoteC4List = [];
    this.lockedTarget = null;

    // 3D Ground Landing Reticle & Smart Lock-On Ring
    this.initReticles();
    this.initWheelUI();
    this.updateHUD();
  }

  initReticles() {
    // Ground landing circle for grenades / C4 / bazooka
    const retGeo = new THREE.RingGeometry(0.85, 1.15, 24);
    const retMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    this.landingReticle = new THREE.Mesh(retGeo, retMat);
    this.landingReticle.rotation.x = -Math.PI / 2;
    this.landingReticle.position.y = 0.08;
    this.landingReticle.visible = false;
    this.scene.add(this.landingReticle);

    // 45-degree Smart Auto-Lock Target Ring
    const lockGeo = new THREE.RingGeometry(0.65, 0.88, 20);
    const lockMat = new THREE.MeshBasicMaterial({
      color: 0xff2a54,
      side: THREE.DoubleSide
    });
    this.lockRing = new THREE.Mesh(lockGeo, lockMat);
    this.lockRing.rotation.x = -Math.PI / 2;
    this.lockRing.visible = false;
    this.scene.add(this.lockRing);
  }

  initWheelUI() {
    this.wheelOverlay = document.getElementById('weapon-wheel-overlay');
    this.wheelCanvas = document.getElementById('weapon-wheel-canvas');
    this.wheelTitleEl = document.getElementById('wheel-weapon-title');
    this.wheelDescEl = document.getElementById('wheel-weapon-desc');

    if (!this.wheelCanvas) return;

    const handlePointer = (e) => {
      const rect = this.wheelCanvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      if (Math.hypot(dx, dy) > 35) {
        let angle = Math.atan2(dy, dx) + Math.PI / 2;
        if (angle < 0) angle += Math.PI * 2;
        const sector = Math.floor(((angle + Math.PI / 8) % (Math.PI * 2)) / (Math.PI / 4));
        if (sector !== this.hoveredIndex) {
          this.hoveredIndex = sector;
          this.drawWheel();
        }
      }
    };

    this.wheelCanvas.addEventListener('pointermove', handlePointer);
    this.wheelCanvas.addEventListener('pointerdown', (e) => {
      handlePointer(e);
      this.selectWeapon(this.hoveredIndex);
      this.closeWheel();
    });
  }

  openWheel() {
    if (this.wheelOpen) return;
    this.wheelOpen = true;
    this.hoveredIndex = this.currentIndex;
    if (this.wheelOverlay) this.wheelOverlay.classList.add('open');
    this.audio.playSFX('wheel_open');
    this.drawWheel();
  }

  closeWheel() {
    if (!this.wheelOpen) return;
    this.wheelOpen = false;
    this.selectWeapon(this.hoveredIndex);
    if (this.wheelOverlay) this.wheelOverlay.classList.remove('open');
  }

  selectWeapon(idx) {
    this.currentIndex = (idx + WEAPON_LIST.length) % WEAPON_LIST.length;
    this.hoveredIndex = this.currentIndex;
    this.updateHUD();
  }

  updateHUD() {
    const w = WEAPON_LIST[this.currentIndex];
    const nameEl = document.getElementById('hud-weapon-name');
    const subEl = document.getElementById('hud-weapon-sub');
    const iconEl = document.getElementById('hud-weapon-icon');
    if (nameEl) nameEl.textContent = w.name;
    if (subEl) subEl.textContent = w.desc.slice(0, 22) + '...';
    if (iconEl) iconEl.textContent = w.icon;
  }

  drawWheel() {
    if (!this.wheelCanvas) return;
    const ctx = this.wheelCanvas.getContext('2d');
    const W = this.wheelCanvas.width;
    const H = this.wheelCanvas.height;
    const cx = W / 2;
    const cy = H / 2;
    ctx.clearRect(0, 0, W, H);

    for (let i = 0; i < 8; i++) {
      const startAngle = -Math.PI / 2 + i * (Math.PI / 4) - Math.PI / 8;
      const endAngle = startAngle + Math.PI / 4;
      const isHovered = i === this.hoveredIndex;

      ctx.beginPath();
      ctx.arc(cx, cy, isHovered ? 198 : 188, startAngle + 0.03, endAngle - 0.03);
      ctx.arc(cx, cy, 90, endAngle - 0.03, startAngle + 0.03, true);
      ctx.closePath();

      ctx.fillStyle = isHovered ? 'rgba(0, 229, 255, 0.38)' : 'rgba(15, 23, 42, 0.88)';
      ctx.fill();
      ctx.lineWidth = isHovered ? 3.5 : 1.5;
      ctx.strokeStyle = isHovered ? '#ffbe0b' : 'rgba(255,255,255,0.22)';
      ctx.stroke();

      const midAngle = (startAngle + endAngle) / 2;
      const rx = cx + Math.cos(midAngle) * 140;
      const ry = cy + Math.sin(midAngle) * 140;

      ctx.font = '28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(WEAPON_LIST[i].icon, rx, ry - 10);

      ctx.fillStyle = isHovered ? '#ffbe0b' : '#f8fafc';
      ctx.font = '800 12px "Noto Sans TC", sans-serif';
      ctx.fillText(WEAPON_LIST[i].shortName, rx, ry + 18);
    }

    const hw = WEAPON_LIST[this.hoveredIndex];
    if (this.wheelTitleEl) this.wheelTitleEl.textContent = hw.name;
    if (this.wheelDescEl) this.wheelDescEl.textContent = hw.desc;
  }

  findSmartLockTarget(playerPos, forwardX, forwardZ, maxRange, npcManager) {
    if (!npcManager) return null;
    let bestNPC = null;
    let bestScore = Infinity;
    const cosHalfCone = Math.cos((24 * Math.PI) / 180);

    for (const npc of npcManager.npcs) {
      if (npc.knockedDown) continue;
      const dx = npc.body.position.x - playerPos.x;
      const dz = npc.body.position.z - playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.5 && dist <= maxRange) {
        const dot = (dx / dist) * forwardX + (dz / dist) * forwardZ;
        if (dot >= cosHalfCone && dist < bestScore) {
          bestScore = dist;
          bestNPC = npc;
        }
      }
    }
    return bestNPC;
  }

  triggerSpecial(player, npcManager) {
    if (this.remoteC4List.length > 0) {
      this.audio.playSFX('microwave_beep');
      for (const c4 of this.remoteC4List) {
        this.scene.remove(c4.mesh);
        if (this.callbacks.onPopup) this.callbacks.onPopup(c4.pos, '🔔 叮！遙控微波爐便當大爆炸！+$10,000', '#ff2a54');
        if (this.callbacks.onDamageAdded) this.callbacks.onDamageAdded(10000, '遙控微波爐便當炸彈', c4.pos);
        this.gameWorld.triggerExplosion(c4.pos.x, c4.pos.y, c4.pos.z, 9.5, npcManager, false);
      }
      this.remoteC4List = [];
      return true;
    }

    this.audio.playSFX('caffeine_boost');
    player.caffeineTimer = 6.0;
    player.health = Math.min(100, player.health + 25);
    if (this.callbacks.onPopup) {
      this.callbacks.onPopup(player.body.position, '☕ 乾杯！6 秒「咖啡因超頻」（移速攻速翻倍＋金電護體）！', '#fde047');
    }
    return true;
  }

  fireWeapon(player, npcManager) {
    const w = WEAPON_LIST[this.currentIndex];
    const speedMult = player.caffeineTimer > 0 ? 0.5 : 1.0;
    if (this.attackTimer > 0) return;
    this.attackTimer = w.cooldown * speedMult;

    const pPos = player.body.position;
    let dirX = Math.sin(player.yaw);
    let dirZ = Math.cos(player.yaw);

    const lockTarget = this.findSmartLockTarget(pPos, dirX, dirZ, w.range, npcManager);
    if (lockTarget) {
      const dx = lockTarget.body.position.x - pPos.x;
      const dz = lockTarget.body.position.z - pPos.z;
      const len = Math.hypot(dx, dz) || 1;
      dirX = dx / len;
      dirZ = dz / len;
      player.yaw = Math.atan2(dirX, dirZ);
    }

    switch (w.id) {
      case 0: {
        const horizSpeed = Math.hypot(player.body.velocity.x, player.body.velocity.z);
        const isFlyingKick = horizSpeed > 5.5 || player.caffeineTimer > 0;
        this.audio.playSFX(isFlyingKick ? 'kick' : 'punch');
        if (isFlyingKick) {
          player.body.velocity.x = dirX * 18;
          player.body.velocity.z = dirZ * 18;
          player.kickAnimTimer = 0.35;
          if (this.callbacks.onPopup && Math.random() < 0.45) this.callbacks.onPopup(pPos, '🦵 衝刺滑鏟飛踢！', '#38bdf8');
        } else {
          player.swingAnimTimer = 0.25;
        }
        this.meleeStrike(pPos, dirX, dirZ, w.range, isFlyingKick ? 19 : 13, npcManager, '別打臉啊！我的眼鏡！');
        break;
      }
      case 1: {
        player.swingAnimTimer = 0.35;
        this.audio.playSFX('wrench_hit');
        if (npcManager && npcManager.reflectIncomingDocuments(pPos, dirX, dirZ, 4.8)) {
          this.audio.playSFX('homerun');
          if (this.callbacks.onComboBanner) this.callbacks.onComboBanner('⚾ HOME RUN! 管鉗全壘打反擊退件公文！+$15,000');
          if (this.callbacks.onDamageAdded) this.callbacks.onDamageAdded(15000, '全壘打反擊退件公文', pPos);
        }
        this.meleeStrike(pPos, dirX, dirZ, w.range, 22, npcManager, '救命！他拿大號管鉗砸過來了！');
        break;
      }
      case 2: {
        this.audio.playSFX('stapler');
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.32), new THREE.MeshBasicMaterial({ color: 0xe2e8f0 }));
        mesh.position.set(pPos.x + dirX * 0.9, pPos.y + 0.6, pPos.z + dirZ * 0.9);
        mesh.rotation.y = Math.atan2(dirX, dirZ);
        this.scene.add(mesh);
        this.projectiles.push({
          type: 'staple', mesh, x: mesh.position.x, y: mesh.position.y, z: mesh.position.z,
          vx: dirX * 36 + (Math.random() - 0.5) * 2.2, vy: 0, vz: dirZ * 36 + (Math.random() - 0.5) * 2.2, life: 0.75
        });
        break;
      }
      case 3: {
        this.audio.playSFX('punch');
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.52), new THREE.MeshStandardMaterial({ color: 0xffffff }));
        mesh.position.set(pPos.x + dirX * 0.8, pPos.y + 0.8, pPos.z + dirZ * 0.8);
        this.scene.add(mesh);
        this.projectiles.push({
          type: 'paper_grenade', mesh, x: mesh.position.x, y: mesh.position.y, z: mesh.position.z,
          vx: dirX * 13, vy: 7.5, vz: dirZ * 13, life: 2.0
        });
        if (this.callbacks.onPopup) this.callbacks.onPopup(pPos, '📄 投出《給水申請書》手榴彈 (2秒引爆)！', '#ffffff');
        break;
      }
      case 4: {
        this.audio.playSFX('splash');
        for (let i = 0; i < 14; i++) {
          this.gameWorld.spawnWaterSpray(pPos.x + dirX * 1.1, pPos.y + 0.6, pPos.z + dirZ * 1.1, dirX * 14, 2.5, dirZ * 14, 1, 4.0);
        }
        if (npcManager) npcManager.scaldNPCsInCone(pPos.x, pPos.z, dirX, dirZ, 7.8);
        break;
      }
      case 5: {
        if (Math.random() < 0.35) this.audio.playSFX('water_jet');
        if (player.isJumping || player.body.position.y > 1.55) {
          player.body.velocity.y = Math.min(8.5, player.body.velocity.y + 2.4);
          this.gameWorld.spawnWaterSpray(pPos.x, pPos.y - 0.5, pPos.z, 0, -14, 0, 6, 2.2);
        }
        this.gameWorld.spawnWaterSpray(pPos.x + dirX * 1.0, pPos.y + 0.5, pPos.z + dirZ * 1.0, dirX * 24, 2.0, dirZ * 24, 6, 2.2);
        if (Math.random() < 0.22) this.gameWorld.createWaterPuddle(pPos.x + dirX * 6, pPos.z + dirZ * 6, 4.2);
        if (npcManager) npcManager.blastNPCsAlongRay(pPos.x, pPos.z, dirX, dirZ, 15.0, 2.4, true);
        this.meleeStrike(pPos, dirX, dirZ, 12.0, 14, null);
        break;
      }
      case 6: {
        this.audio.playSFX('punch');
        const mwMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.65, 0.45, 0.5),
          new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xdc2626, emissiveIntensity: 0.4 })
        );
        const targetX = pPos.x + dirX * 5.5, targetZ = pPos.z + dirZ * 5.5;
        mwMesh.position.set(targetX, 0.45, targetZ);
        this.scene.add(mwMesh);
        this.remoteC4List.push({ mesh: mwMesh, pos: { x: targetX, y: 0.5, z: targetZ } });
        if (this.callbacks.onPopup) this.callbacks.onPopup(mwMesh.position, '🍱 微波爐炸彈已吸附！按 [E] 鍵「叮！」引爆！', '#fde047');
        break;
      }
      case 7: {
        this.audio.playSFX('splash');
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(0.95, 14, 14),
          new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x0284c7, emissiveIntensity: 0.6, transparent: true, opacity: 0.88 })
        );
        sphere.position.set(pPos.x + dirX * 1.4, pPos.y + 0.9, pPos.z + dirZ * 1.4);
        this.scene.add(sphere);
        this.projectiles.push({
          type: 'water_bazooka', mesh: sphere, x: sphere.position.x, y: sphere.position.y, z: sphere.position.z,
          vx: dirX * 22, vy: 2.0, vz: dirZ * 22, life: 1.4
        });
        break;
      }
    }
  }

  meleeStrike(origin, dirX, dirZ, range, force, npcManager, bubbleText) {
    for (const prop of this.gameWorld.destructibles) {
      if (!prop.broken) {
        const dx = prop.body.position.x - origin.x;
        const dz = prop.body.position.z - origin.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= range + 0.8) {
          const dot = (dx / (dist || 1)) * dirX + (dz / (dist || 1)) * dirZ;
          if (dot > 0.25 || dist < 1.8) {
            this.gameWorld.damageProp(prop, origin, force, npcManager);
          }
        }
      }
    }

    for (const pipe of this.gameWorld.rollingPipes) {
      const dist = Math.hypot(pipe.body.position.x - origin.x, pipe.body.position.z - origin.z);
      if (dist <= range + 1.5) {
        pipe.body.wakeUp();
        pipe.body.velocity.x += dirX * force * 0.7;
        pipe.body.velocity.z += dirZ * force * 0.7;
      }
    }

    if (npcManager) {
      npcManager.hitNPCsInCone(origin.x, origin.z, dirX, dirZ, range, force, bubbleText);
    }
  }

  update(dt, player, npcManager, isDriving) {
    if (this.attackTimer > 0) this.attackTimer -= dt;

    const w = WEAPON_LIST[this.currentIndex];
    const pPos = player.body.position;
    const dirX = Math.sin(player.yaw);
    const dirZ = Math.cos(player.yaw);

    if (!isDriving) {
      const locked = this.findSmartLockTarget(pPos, dirX, dirZ, w.range, npcManager);
      if (locked) {
        this.lockRing.visible = true;
        this.lockRing.position.set(locked.body.position.x, 0.09, locked.body.position.z);
        this.lockRing.rotation.z += dt * 5;
      } else {
        this.lockRing.visible = false;
      }

      if (w.showReticle) {
        this.landingReticle.visible = true;
        const dist = w.id === 6 ? 5.5 : 10.5;
        this.landingReticle.position.set(pPos.x + dirX * dist, 0.08, pPos.z + dirZ * dist);
      } else {
        this.landingReticle.visible = false;
      }
    } else {
      this.lockRing.visible = false;
      this.landingReticle.visible = false;
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.life -= dt;
      if (proj.type === 'paper_grenade') proj.vy -= 18 * dt;
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      proj.z += proj.vz * dt;

      if (proj.y < 0.25 && proj.type === 'paper_grenade') {
        proj.y = 0.25;
        proj.vy *= -0.45;
        proj.vx *= 0.7;
        proj.vz *= 0.7;
      }

      proj.mesh.position.set(proj.x, proj.y, proj.z);

      if (proj.type === 'staple') {
        let hit = false;
        if (npcManager && npcManager.hitSingleNPCAt(proj.x, proj.z, 1.3, 9, '好痛！誰用訂書機射我！')) hit = true;
        for (const prop of this.gameWorld.destructibles) {
          if (!prop.broken && Math.hypot(prop.body.position.x - proj.x, prop.body.position.z - proj.z) < 1.1) {
            this.gameWorld.damageProp(prop, proj, 10, npcManager);
            hit = true;
            break;
          }
        }
        if (hit || proj.life <= 0) {
          this.scene.remove(proj.mesh);
          this.projectiles.splice(i, 1);
        }
      } else if (proj.type === 'paper_grenade') {
        proj.mesh.rotation.x += dt * 8;
        proj.mesh.rotation.y += dt * 6;
        if (proj.life <= 0) {
          this.gameWorld.triggerExplosion(proj.x, proj.y, proj.z, 8.5, npcManager, true);
          if (this.callbacks.onPopup) this.callbacks.onPopup(proj, '📄《給水申請書》漫天紙片大爆炸！', '#ffffff');
          this.scene.remove(proj.mesh);
          this.projectiles.splice(i, 1);
        }
      } else if (proj.type === 'water_bazooka') {
        this.gameWorld.spawnWaterSpray(proj.x, proj.y, proj.z, -proj.vx * 0.3, 3, -proj.vz * 0.3, 3, 2);
        let hit = proj.y <= 0.4 || proj.life <= 0;
        if (npcManager && npcManager.findNearestNPC(proj.x, proj.z, 2.0)) hit = true;
        if (hit) {
          this.audio.playSFX('explosion');
          this.gameWorld.spawnWaterSpray(proj.x, 1.0, proj.z, 0, 15, 0, 65, 9);
          this.gameWorld.createWaterPuddle(proj.x, proj.z, 7.5);
          this.gameWorld.triggerExplosion(proj.x, 0.8, proj.z, 9.5, npcManager, false);
          if (npcManager) npcManager.blastNPCsAlongRay(proj.x - 4, proj.z - 4, 0.7, 0.7, 12, 6, true);
          if (this.callbacks.onPopup) this.callbacks.onPopup(proj, '🌊 幹管高壓水球轟炸！全場沖飛！', '#00e5ff');
          this.scene.remove(proj.mesh);
          this.projectiles.splice(i, 1);
        }
      }
    }
  }
}
