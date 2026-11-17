// js/world.js
// 室內外無縫 3D 沙盒地圖、可破壞公物、「水＋電」連鎖反應、InstancedMesh 粒子與支線光圈

import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class GameWorld {
  constructor(scene, physicsWorld, audio, callbacks = {}) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;
    this.audio = audio;
    this.callbacks = callbacks;

    this.destructibles = [];
    this.rollingPipes = [];
    this.puddles = [];
    this.tornadoes = [];
    this.explosions = [];
    this.missionRings = [];
    this.pantryZone = { minX: -27, maxX: -15, minZ: -33, maxZ: -19 };
    this.waterPoolZone = { x: 24, z: 30, radius: 6.2 };

    this.MAX_DEBRIS = 80;
    this.debrisList = [];

    this.WATER_PARTICLE_COUNT = 240;
    this.waterParticles = [];
    this.waterInstancedMesh = null;

    this.PAPER_PARTICLE_COUNT = 240;
    this.paperParticles = [];
    this.paperInstancedMesh = null;

    this.pipeBurstTimer = 0;
    this.dummyObj = new THREE.Object3D();

    this.initMaterials();
    this.buildInstancedFloor();
    this.buildArchitecture();
    this.buildWallPosters();
    this.buildIndoorProps();
    this.buildOutdoorYard();
    this.buildMissionCoronas();
    this.initInstancedParticles();
  }

  initMaterials() {
    this.defaultPhysMat = new CANNON.Material('default');
    const contactMat = new CANNON.ContactMaterial(this.defaultPhysMat, this.defaultPhysMat, {
      friction: 0.35,
      restitution: 0.25
    });
    this.physicsWorld.addContactMaterial(contactMat);
    this.physicsWorld.defaultContactMaterial = contactMat;

    this.matWall = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.75 });
    this.matPillar = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5 });
    this.matCubicle = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.65 });
    this.matDesk = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.6 });
    this.matMonitor = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.4 });
    this.matScreen = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    this.matGlass = new THREE.MeshPhysicalMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.42,
      roughness: 0.1
    });
    this.matBluePipe = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.35, metalness: 0.15 });
    this.matCone = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.5 });
  }

  buildInstancedFloor() {
    const groundBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: this.defaultPhysMat
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.physicsWorld.addBody(groundBody);

    const baseMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 })
    );
    baseMesh.rotation.x = -Math.PI / 2;
    baseMesh.position.y = -0.02;
    baseMesh.receiveShadow = true;
    this.scene.add(baseMesh);

    const cols = 24;
    const rows = 26;
    const instancedTiles = new THREE.InstancedMesh(
      new THREE.BoxGeometry(3.94, 0.08, 3.94),
      new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0.08 }),
      cols * rows
    );
    instancedTiles.receiveShadow = true;

    const color = new THREE.Color();
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      const z = -38 + r * 4;
      for (let c = 0; c < cols; c++) {
        const x = -46 + c * 4;
        this.dummyObj.position.set(x, -0.03, z);
        this.dummyObj.rotation.set(0, 0, 0);
        this.dummyObj.scale.set(1, 1, 1);
        this.dummyObj.updateMatrix();
        instancedTiles.setMatrixAt(idx, this.dummyObj.matrix);

        if (z < 6 && Math.abs(x) <= 28) {
          color.setHex(x < -14 && z < -18
            ? ((r + c) % 2 === 0 ? 0xcffafe : 0x99f6e4)
            : ((r + c) % 2 === 0 ? 0xf1f5f9 : 0xcbd5e1));
        } else {
          color.setHex((r + c) % 2 === 0 ? 0x334155 : 0x3b495e);
        }
        instancedTiles.setColorAt(idx, color);
        idx++;
      }
    }
    instancedTiles.instanceMatrix.needsUpdate = true;
    if (instancedTiles.instanceColor) instancedTiles.instanceColor.needsUpdate = true;
    this.scene.add(instancedTiles);
  }

  buildArchitecture() {
    const addStaticWall = (x, y, z, w, h, d, mat = this.matWall) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      const body = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)),
        position: new CANNON.Vec3(x, y, z)
      });
      this.physicsWorld.addBody(body);
    };

    addStaticWall(0, 4, -34, 58, 8, 1.2);
    addStaticWall(-29, 4, -14, 1.2, 8, 40);
    addStaticWall(29, 4, -14, 1.2, 8, 40);
    addStaticWall(-20, 4, 6, 18, 8, 1.0, this.matPillar);
    addStaticWall(20, 4, 6, 18, 8, 1.0, this.matPillar);
    addStaticWall(0, 6.8, 6, 22, 2.4, 1.2, this.matPillar);

    // Pantry partition wall & service counter
    addStaticWall(-15, 2.2, -26, 0.6, 4.4, 12, this.matCubicle);
    addStaticWall(-16, 1.1, -4, 14, 2.2, 1.6, this.matPillar);

    // Outdoor perimeter
    addStaticWall(0, 2.0, 64, 96, 4.0, 1.5, this.matCubicle);
    addStaticWall(-48, 2.0, 15, 1.5, 4.0, 100, this.matCubicle);
    addStaticWall(48, 2.0, 15, 1.5, 4.0, 100, this.matCubicle);

    // 6 Floor-to-ceiling smashable glass doors at z = 6
    for (let i = 0; i < 6; i++) {
      this.spawnDestructible({
        type: 'glass_door',
        name: '一樓大廳落地玻璃門',
        x: -8.75 + i * 3.5,
        y: 2.6,
        z: 6.0,
        w: 3.35,
        h: 5.2,
        d: 0.28,
        mass: 0,
        value: 8500
      });
    }
  }

  buildWallPosters() {
    const makePoster = (w, h, drawFn, pos) => {
      const c = document.createElement('canvas');
      c.width = 768;
      c.height = 384;
      drawFn(c.getContext('2d'));
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), side: THREE.DoubleSide })
      );
      m.position.set(pos[0], pos[1], pos[2]);
      this.scene.add(m);
    };

    makePoster(18, 4.0, (ctx) => {
      ctx.fillStyle = '#0369a1';
      ctx.fillRect(0, 0, 768, 384);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 12;
      ctx.strokeRect(10, 10, 748, 364);
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 54px "Noto Sans TC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('💧 台灣自來水公司：罪惡營業處', 384, 175);
      ctx.fillStyle = '#fde047';
      ctx.font = '700 32px monospace';
      ctx.fillText('GRAND THEFT WATER CORP. SERVICE HALL', 384, 285);
    }, [0, 7.2, 6.65]);

    makePoster(13, 6.0, (ctx) => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 768, 384);
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 10;
      ctx.strokeRect(12, 12, 744, 360);
      ctx.fillStyle = '#00e5ff';
      ctx.font = '900 50px "Noto Sans TC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('【節約用水標語】', 384, 95);
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 40px "Noto Sans TC", sans-serif';
      ctx.fillText('涓滴珍貴・嚴禁拿消防水槍噴科長假髮', 384, 190);
      ctx.fillStyle = '#facc15';
      ctx.font = '700 32px "Noto Sans TC", sans-serif';
      ctx.fillText('⚠️ 飲水機漏水＋砸毀電腦主機＝高壓電弧麻痺！', 384, 290);
    }, [-12, 4.3, -33.3]);

    makePoster(13, 6.0, (ctx) => {
      ctx.fillStyle = '#041424';
      ctx.fillRect(0, 0, 768, 384);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 8;
      ctx.strokeRect(10, 10, 748, 364);
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(90, 300); ctx.lineTo(240, 210); ctx.lineTo(390, 250); ctx.lineTo(540, 140); ctx.lineTo(680, 110);
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.font = '900 40px "Noto Sans TC", sans-serif';
      ctx.fillText('🗺️ 全台供水管網監控圖 (SCADA)', 40, 70);
      ctx.fillStyle = '#f87171';
      ctx.font = '700 28px monospace';
      ctx.fillText('WARNING: 5-STAR WANTED TRIGGERS PIPE BURST!', 40, 345);
    }, [12, 4.3, -33.3]);
  }

  buildIndoorProps() {
    const rowZ = [-26, -18, -10];
    const colX = [-6, 3, 12, 21];

    rowZ.forEach((z) => {
      colX.forEach((x) => {
        const partMesh = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.5, 0.2), this.matCubicle);
        partMesh.position.set(x, 0.75, z - 1.1);
        partMesh.castShadow = true;
        this.scene.add(partMesh);

        this.spawnDestructible({
          type: 'desk', name: '辦公桌', x, y: 0.45, z, w: 3.2, h: 0.9, d: 1.4, mass: 18, value: 2500
        });

        [-0.8, 0.8].forEach((offsetX) => {
          this.spawnDestructible({
            type: 'monitor', name: 'AutoCAD 電腦螢幕', x: x + offsetX, y: 1.25, z, w: 0.85, h: 0.65, d: 0.25, mass: 3.5, value: 4500
          });
        });

        this.spawnDestructible({
          type: 'pc_tower', name: '高壓電腦主機與延長線', x: x + 1.85, y: 0.45, z, w: 0.55, h: 0.85, d: 0.65, mass: 6, value: 6200
        });
      });
    });

    [[-18, -24], [-8, -18], [7, -18], [16, -10], [-9, -5], [0, -26]].forEach(([dx, dz]) => {
      this.spawnDestructible({
        type: 'water_dispenser', name: '桶裝水飲水機', x: dx, y: 0.95, z: dz, w: 0.75, h: 1.9, d: 0.75, mass: 12, value: 5800
      });
      this.spawnDestructible({
        type: 'pc_tower', name: '落地高壓延長線與伺服器', x: dx + 1.5, y: 0.45, z: dz + 0.4, w: 0.6, h: 0.85, d: 0.6, mass: 6, value: 6500
      });
    });

    [[-3, -14], [8, -14], [-14, -10], [19, -22]].forEach(([sx, sz]) => {
      this.spawnDestructible({
        type: 'shredder', name: '大型機密公文碎紙機', x: sx, y: 0.75, z: sz, w: 1.1, h: 1.5, d: 0.9, mass: 16, value: 9000
      });
    });

    [[-22, -28], [-19, -22], [-2, -5], [10, -5]].forEach(([mx, mz]) => {
      this.spawnDestructible({
        type: 'microwave', name: '茶水間高火力微波爐', x: mx, y: 0.9, z: mz, w: 0.95, h: 0.65, d: 0.7, mass: 8, value: 7500
      });
    });

    [[-12, -16], [2, -5], [22, -14]].forEach(([px, pz]) => {
      this.spawnDestructible({
        type: 'printer', name: '多功能事務印表機', x: px, y: 0.65, z: pz, w: 1.2, h: 1.3, d: 1.0, mass: 15, value: 8200
      });
    });
  }

  buildOutdoorYard() {
    const poolGroup = new THREE.Group();
    poolGroup.position.set(this.waterPoolZone.x, 0, this.waterPoolZone.z);

    const rimMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(6.5, 6.8, 0.7, 24, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.6 })
    );
    rimMesh.position.y = 0.35;
    poolGroup.add(rimMesh);

    const waterDisk = new THREE.Mesh(
      new THREE.CylinderGeometry(6.3, 6.3, 0.45, 24),
      new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x0284c7, emissiveIntensity: 0.35, transparent: true, opacity: 0.85 })
    );
    waterDisk.position.y = 0.22;
    poolGroup.add(waterDisk);
    this.scene.add(poolGroup);

    this.puddles.push({
      x: this.waterPoolZone.x, z: this.waterPoolZone.z, radius: 6.2, targetRadius: 6.2, electrified: false, permanent: true, mesh: null, arcGroup: null
    });

    [{ x: -22, z: 24 }, { x: -22, z: 27.2 }, { x: -10, z: 38 }, { x: 6, z: 42 }].forEach((p, idx) => {
      const radius = 1.05;
      const length = 6.8;
      const pipeGroup = new THREE.Group();
      const outerMesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 16), this.matBluePipe);
      outerMesh.rotation.z = Math.PI / 2;
      outerMesh.castShadow = true;
      pipeGroup.add(outerMesh);

      const stripeMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius + 0.02, radius + 0.02, 0.8, 16),
        new THREE.MeshBasicMaterial({ color: 0xe0f2fe })
      );
      stripeMesh.rotation.z = Math.PI / 2;
      pipeGroup.add(stripeMesh);

      pipeGroup.position.set(p.x, radius + 0.05, p.z);
      this.scene.add(pipeGroup);

      const shape = new CANNON.Cylinder(radius, radius, length, 12);
      const body = new CANNON.Body({
        mass: 45,
        position: new CANNON.Vec3(p.x, radius + 0.05, p.z),
        linearDamping: 0.08,
        angularDamping: 0.08
      });
      const q = new CANNON.Quaternion();
      q.setFromEuler(0, 0, Math.PI / 2);
      body.addShape(shape, new CANNON.Vec3(0, 0, 0), q);
      body.allowSleep = true;
      this.physicsWorld.addBody(body);

      this.rollingPipes.push({ id: `pvc_pipe_${idx}`, mesh: pipeGroup, body, radius });
    });

    for (let i = 0; i < 14; i++) {
      this.spawnDestructible({
        type: 'cone', name: '工務反光三角錐', x: -28 + (i % 7) * 9, y: 0.45, z: i < 7 ? 14 : 32, w: 0.6, h: 0.9, d: 0.6, mass: 2.0, value: 800
      });
    }
  }

  buildMissionCoronas() {
    const missions = [
      { id: 'smash_pcs', title: '⚡ 支線挑戰：暴走資訊室', desc: '60 秒內砸毀 15 台電腦或辦公設備！', targetCount: 15, duration: 60, x: 0, z: 10.5, color: 0xff2a54 },
      { id: 'forklift_boss', title: '🚜 支線挑戰：主管清涼下水禮', desc: '90 秒內用堆高機或水柱把 3 位主管送進蓄水池（或擊飛 3 位主管）！', targetCount: 3, duration: 90, x: 14, z: 22, color: 0xffbe0b },
      { id: 'water_electric', title: '💧 支線挑戰：水電連鎖大掃除', desc: '60 秒內觸發水＋電麻痺或累積 $50,000 公物損失！', targetCount: 50000, duration: 60, x: -13, z: 13.5, color: 0x00e5ff }
    ];

    missions.forEach((m) => {
      const group = new THREE.Group();
      group.position.set(m.x, 0.05, m.z);

      const ringMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.2, 2.6, 20, 1, true),
        new THREE.MeshBasicMaterial({ color: m.color, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false })
      );
      ringMesh.position.y = 1.3;
      group.add(ringMesh);

      const baseRing = new THREE.Mesh(
        new THREE.RingGeometry(1.7, 2.3, 24),
        new THREE.MeshBasicMaterial({ color: m.color, side: THREE.DoubleSide })
      );
      baseRing.rotation.x = -Math.PI / 2;
      baseRing.position.y = 0.04;
      group.add(baseRing);

      this.scene.add(group);
      this.missionRings.push({ ...m, group, ringMesh });
    });
  }

  spawnDestructible(cfg) {
    const group = new THREE.Group();
    group.position.set(cfg.x, cfg.y, cfg.z);

    if (cfg.type === 'glass_door') {
      group.add(new THREE.Mesh(new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d), this.matGlass));
    } else if (cfg.type === 'monitor') {
      const bezel = new THREE.Mesh(new THREE.BoxGeometry(cfg.w, cfg.h * 0.85, 0.12), this.matMonitor);
      group.add(bezel);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(cfg.w * 0.85, cfg.h * 0.68), this.matScreen);
      scr.position.z = 0.07;
      group.add(scr);
    } else if (cfg.type === 'water_dispenser') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.15, 0.7), new THREE.MeshStandardMaterial({ color: 0xf8fafc }));
      base.position.y = -0.35;
      group.add(base);
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.75, 12), new THREE.MeshPhysicalMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.75 }));
      bottle.position.y = 0.55;
      group.add(bottle);
    } else if (cfg.type === 'pc_tower') {
      group.add(new THREE.Mesh(new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d), new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5 })));
    } else if (cfg.type === 'shredder') {
      group.add(new THREE.Mesh(new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d), new THREE.MeshStandardMaterial({ color: 0x475569 })));
    } else if (cfg.type === 'microwave') {
      group.add(new THREE.Mesh(new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d), new THREE.MeshStandardMaterial({ color: 0xf1f5f9 })));
    } else if (cfg.type === 'cone') {
      group.add(new THREE.Mesh(new THREE.ConeGeometry(0.32, cfg.h, 10), this.matCone));
    } else {
      group.add(new THREE.Mesh(new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d), cfg.type === 'desk' ? this.matDesk : this.matCubicle));
    }

    this.scene.add(group);
    const body = new CANNON.Body({
      mass: cfg.mass,
      shape: new CANNON.Box(new CANNON.Vec3(cfg.w / 2, cfg.h / 2, cfg.d / 2)),
      position: new CANNON.Vec3(cfg.x, cfg.y, cfg.z),
      linearDamping: 0.25,
      angularDamping: 0.3
    });
    body.allowSleep = true;
    this.physicsWorld.addBody(body);

    const prop = { ...cfg, mesh: group, body, broken: false, countdown: null };
    body.userData = { prop };
    this.destructibles.push(prop);
    return prop;
  }

  initInstancedParticles() {
    this.waterInstancedMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.14, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.85 }),
      this.WATER_PARTICLE_COUNT
    );
    this.waterInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.waterInstancedMesh);

    for (let i = 0; i < this.WATER_PARTICLE_COUNT; i++) {
      this.waterParticles.push({ active: false, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, life: 0, scale: 1 });
      this.dummyObj.position.set(0, -100, 0);
      this.dummyObj.updateMatrix();
      this.waterInstancedMesh.setMatrixAt(i, this.dummyObj.matrix);
    }

    this.paperInstancedMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.38, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
      this.PAPER_PARTICLE_COUNT
    );
    this.paperInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.paperInstancedMesh);

    for (let i = 0; i < this.PAPER_PARTICLE_COUNT; i++) {
      this.paperParticles.push({ active: false, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, life: 0 });
      this.dummyObj.position.set(0, -100, 0);
      this.dummyObj.updateMatrix();
      this.paperInstancedMesh.setMatrixAt(i, this.dummyObj.matrix);
    }
  }

  spawnWaterSpray(x, y, z, vx, vy, vz, count = 8, spread = 2.0) {
    let spawned = 0;
    for (let i = 0; i < this.WATER_PARTICLE_COUNT && spawned < count; i++) {
      const p = this.waterParticles[i];
      if (!p.active) {
        p.active = true;
        p.x = x + (Math.random() - 0.5) * 0.4;
        p.y = y + (Math.random() - 0.5) * 0.4;
        p.z = z + (Math.random() - 0.5) * 0.4;
        p.vx = vx + (Math.random() - 0.5) * spread;
        p.vy = vy + (Math.random() - 0.5) * spread;
        p.vz = vz + (Math.random() - 0.5) * spread;
        p.life = 0.65 + Math.random() * 0.45;
        p.scale = 0.8 + Math.random() * 0.8;
        spawned++;
      }
    }
  }

  spawnPaperBurst(x, y, z, count = 45, upwardSpeed = 9) {
    let spawned = 0;
    for (let i = 0; i < this.PAPER_PARTICLE_COUNT && spawned < count; i++) {
      const p = this.paperParticles[i];
      if (!p.active) {
        p.active = true;
        p.x = x + (Math.random() - 0.5) * 1.2;
        p.y = y + Math.random() * 0.8;
        p.z = z + (Math.random() - 0.5) * 1.2;
        const angle = Math.random() * Math.PI * 2;
        const spd = 2 + Math.random() * 7;
        p.vx = Math.cos(angle) * spd;
        p.vy = upwardSpeed * (0.5 + Math.random() * 0.8);
        p.vz = Math.sin(angle) * spd;
        p.rx = Math.random() * Math.PI;
        p.ry = Math.random() * Math.PI;
        p.rz = Math.random() * Math.PI;
        p.life = 2.2 + Math.random() * 1.6;
        spawned++;
      }
    }
  }

  spawnDebrisChunk(x, y, z, colorHex = 0x38bdf8) {
    if (this.debrisList.length >= this.MAX_DEBRIS) {
      const oldest = this.debrisList.shift();
      this.scene.remove(oldest.mesh);
      this.physicsWorld.removeBody(oldest.body);
    }
    const size = 0.24;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshStandardMaterial({ color: colorHex }));
    mesh.position.set(x, y, z);
    this.scene.add(mesh);

    const body = new CANNON.Body({
      mass: 0.6,
      shape: new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2)),
      position: new CANNON.Vec3(x, y, z)
    });
    body.velocity.set((Math.random() - 0.5) * 12, 4 + Math.random() * 8, (Math.random() - 0.5) * 12);
    body.allowSleep = true;
    this.physicsWorld.addBody(body);
    this.debrisList.push({ mesh, body, life: 7.0 });
  }

  damageProp(prop, impactPos, forceMagnitude = 14, npcManager = null) {
    if (!prop || prop.broken) return;
    if (prop.type === 'microwave') {
      if (prop.countdown === null) {
        prop.countdown = 3.0;
        this.audio.playSFX('wrench_hit');
        if (this.callbacks.onPopup) this.callbacks.onPopup(prop.body.position, '⏱️ 微波爐過熱倒數 3 秒！', '#facc15');
      }
      return;
    }

    prop.broken = true;
    const pos = prop.body.position;
    if (this.callbacks.onDamageAdded) this.callbacks.onDamageAdded(prop.value, prop.name, pos);
    if (this.callbacks.onPropDestroyed) this.callbacks.onPropDestroyed(prop);

    for (let i = 0; i < 2; i++) {
      this.spawnDebrisChunk(pos.x, pos.y + 0.3, pos.z, prop.type === 'glass_door' ? 0x67e8f9 : 0x64748b);
    }

    if (prop.type === 'glass_door') {
      this.audio.playSFX('glass_break');
      this.scene.remove(prop.mesh);
      this.physicsWorld.removeBody(prop.body);
      if (this.callbacks.onPopup) this.callbacks.onPopup(pos, '💥 撞碎落地玻璃門！+$8,500', '#67e8f9');
      return;
    }

    if (prop.body.mass > 0 && impactPos) {
      const dx = pos.x - impactPos.x;
      const dz = pos.z - impactPos.z;
      const len = Math.hypot(dx, dz) || 1;
      prop.body.wakeUp();
      prop.body.velocity.set((dx / len) * forceMagnitude, 5, (dz / len) * forceMagnitude);
      prop.body.angularVelocity.set(Math.random() * 5, Math.random() * 5, Math.random() * 5);
    }

    if (prop.type === 'water_dispenser') {
      this.audio.playSFX('splash');
      const puddle = this.createWaterPuddle(pos.x, pos.z, 6.2);
      this.spawnWaterSpray(pos.x, pos.y + 0.6, pos.z, 0, 11, 0, 32, 5);
      if (this.callbacks.onPopup) this.callbacks.onPopup(pos, '💦 飲水機爆裂！形成藍色濕滑水灘！', '#00e5ff');
      this.checkWaterElectricChain(puddle, npcManager);
    } else if (prop.type === 'pc_tower') {
      this.audio.playSFX('electric_zap');
      let triggered = false;
      this.puddles.forEach((puddle) => {
        if (Math.hypot(pos.x - puddle.x, pos.z - puddle.z) <= puddle.targetRadius + 3.2) {
          this.electrifyPuddle(puddle, npcManager);
          triggered = true;
        }
      });
      if (!triggered && this.callbacks.onPopup) {
        this.callbacks.onPopup(pos, '⚡ 電腦主機漏電！(打破旁邊飲水機可觸發電弧水灘)', '#fde047');
      }
    } else if (prop.type === 'shredder') {
      this.audio.playSFX('shredder_tornado');
      this.tornadoes.push({ x: pos.x, z: pos.z, timer: 6.5 });
      this.spawnPaperBurst(pos.x, pos.y + 0.8, pos.z, 65, 12);
      if (this.callbacks.onPopup) this.callbacks.onPopup(pos, '🌪️ 碎紙機暴走！白色紙片龍捲風！', '#ffffff');
    } else {
      this.audio.playSFX('wrench_hit');
    }
  }

  createWaterPuddle(x, z, maxRadius = 6.0) {
    for (const existing of this.puddles) {
      if (!existing.permanent && Math.hypot(existing.x - x, existing.z - z) < 2.8) {
        existing.targetRadius = Math.min(8.5, existing.targetRadius + 2.0);
        return existing;
      }
    }

    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(1, 24),
      new THREE.MeshStandardMaterial({ color: 0x00b4d8, emissive: 0x0077b6, emissiveIntensity: 0.3, transparent: true, opacity: 0.78 })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.03, z);
    this.scene.add(mesh);

    const arcGroup = new THREE.Group();
    arcGroup.position.set(x, 0.12, z);
    arcGroup.visible = false;
    const arcMat = new THREE.LineBasicMaterial({ color: 0xfacc15 });
    for (let i = 0; i < 6; i++) {
      const pts = [];
      for (let j = 0; j < 6; j++) pts.push(new THREE.Vector3((j - 2.5) * 0.35, (j % 2) * 0.28, (Math.random() - 0.5) * 0.8));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), arcMat);
      line.rotation.y = (i * Math.PI) / 3;
      arcGroup.add(line);
    }
    this.scene.add(arcGroup);

    const puddle = { x, z, radius: 0.8, targetRadius: maxRadius, electrified: false, electricTimer: 0, permanent: false, mesh, arcGroup };
    this.puddles.push(puddle);
    return puddle;
  }

  checkWaterElectricChain(puddle, npcManager) {
    if (!puddle) return;
    for (const prop of this.destructibles) {
      if (prop.type === 'pc_tower' && prop.broken) {
        if (Math.hypot(prop.body.position.x - puddle.x, prop.body.position.z - puddle.z) <= puddle.targetRadius + 3.2) {
          this.electrifyPuddle(puddle, npcManager);
          break;
        }
      }
    }
  }

  electrifyPuddle(puddle, npcManager) {
    if (!puddle) return;
    const firstTime = !puddle.electrified;
    puddle.electrified = true;
    puddle.electricTimer = 14.0;
    if (puddle.arcGroup) puddle.arcGroup.visible = true;
    if (puddle.mesh) {
      puddle.mesh.material.emissive.setHex(0xfacc15);
      puddle.mesh.material.emissiveIntensity = 0.65;
    }
    this.audio.playSFX('electric_zap');

    if (firstTime) {
      if (this.callbacks.onDamageAdded) this.callbacks.onDamageAdded(15000, '水＋電元素連鎖電弧！', { x: puddle.x, y: 1.5, z: puddle.z });
      if (this.callbacks.onPopup) this.callbacks.onPopup({ x: puddle.x, y: 1.8, z: puddle.z }, '⚡ 水＋電連鎖反應！金色電弧麻痺全場！+$15,000', '#fde047');
      this.audio.pushBreakingNews('🎙️【FM 98.7 緊急插播】營業處發生「飲水機水灘＋電腦主機」高壓漏電連鎖反應！現場同仁集體觸電麻痺倒地！');
    }
    if (npcManager) npcManager.electrocuteNPCsInRadius(puddle.x, puddle.z, puddle.targetRadius + 2.5);
  }

  triggerExplosion(x, y, z, radius = 8.5, npcManager = null, isPaperGrenade = false) {
    this.audio.playSFX('explosion');
    if (isPaperGrenade) {
      this.spawnPaperBurst(x, y + 0.5, z, 90, 13);
    } else {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(1, 14, 14),
        new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.85 })
      );
      sphere.position.set(x, y, z);
      this.scene.add(sphere);
      this.explosions.push({ mesh: sphere, scale: 1, maxScale: radius * 0.75, life: 0.45 });
    }

    this.destructibles.forEach((prop) => {
      if (Math.hypot(prop.body.position.x - x, prop.body.position.z - z) <= radius) {
        this.damageProp(prop, { x, y, z }, 18, npcManager);
      }
    });
    this.rollingPipes.forEach((pipe) => {
      if (Math.hypot(pipe.body.position.x - x, pipe.body.position.z - z) <= radius + 2) {
        pipe.body.wakeUp();
        pipe.body.velocity.z += (pipe.body.position.z >= z ? 1 : -1) * 14;
      }
    });
    if (npcManager) npcManager.explodeNPCsInRadius(x, z, radius);
  }

  triggerInstantWaterElectricDemo(playerPos, npcManager) {
    const x = playerPos.x + 2.5;
    const z = playerPos.z - 2.5;
    const puddle = this.createWaterPuddle(x, z, 6.5);
    puddle.radius = 6.2;
    this.spawnWaterSpray(x, 1.0, z, 0, 12, 0, 40, 6);
    this.electrifyPuddle(puddle, npcManager);
  }

  update(dt, npcManager, wantedStars = 0) {
    for (const prop of this.destructibles) {
      if (prop.mesh && prop.body && (prop.body.mass > 0 || prop.broken)) {
        prop.mesh.position.copy(prop.body.position);
        prop.mesh.quaternion.copy(prop.body.quaternion);
      }
      if (prop.type === 'microwave' && prop.countdown !== null && !prop.broken) {
        prop.countdown -= dt;
        prop.mesh.scale.setScalar(1 + Math.sin(prop.countdown * 22) * 0.12);
        if (prop.countdown <= 0) {
          prop.broken = true;
          const pos = prop.body.position;
          this.audio.playSFX('microwave_beep');
          if (this.callbacks.onPopup) this.callbacks.onPopup(pos, '🔔 叮！茶水間微波爐大爆炸！+$12,000', '#ff2a54');
          if (this.callbacks.onDamageAdded) this.callbacks.onDamageAdded(12000, '茶水間微波爐爆炸', pos);
          this.triggerExplosion(pos.x, pos.y, pos.z, 9.0, npcManager, false);
        }
      }
    }

    for (const pipe of this.rollingPipes) {
      pipe.mesh.position.copy(pipe.body.position);
      pipe.mesh.quaternion.copy(pipe.body.quaternion);
      if (pipe.body.velocity.length() > 2.2 && npcManager) {
        npcManager.crushNPCsByPipe(pipe.body.position, pipe.radius + 0.9, 3.2);
      }
    }

    for (let i = this.debrisList.length - 1; i >= 0; i--) {
      const d = this.debrisList[i];
      d.life -= dt;
      d.mesh.position.copy(d.body.position);
      d.mesh.quaternion.copy(d.body.quaternion);
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        this.physicsWorld.removeBody(d.body);
        this.debrisList.splice(i, 1);
      }
    }

    for (const puddle of this.puddles) {
      if (!puddle.permanent && puddle.radius < puddle.targetRadius) {
        puddle.radius = Math.min(puddle.targetRadius, puddle.radius + dt * 3.2);
        if (puddle.mesh) puddle.mesh.scale.set(puddle.radius, puddle.radius, 1);
      }
      if (puddle.electrified && puddle.arcGroup) {
        puddle.arcGroup.rotation.y += dt * 9;
        puddle.arcGroup.scale.setScalar(puddle.radius * 0.85);
        puddle.electricTimer -= dt;
        if (npcManager && Math.random() < 0.25) npcManager.electrocuteNPCsInRadius(puddle.x, puddle.z, puddle.radius + 1.0);
        if (puddle.electricTimer <= 0) {
          puddle.electrified = false;
          puddle.arcGroup.visible = false;
          if (puddle.mesh) puddle.mesh.material.emissive.setHex(0x0077b6);
        }
      }
    }

    for (let i = this.tornadoes.length - 1; i >= 0; i--) {
      const t = this.tornadoes[i];
      t.timer -= dt;
      if (Math.random() < 0.65) this.spawnPaperBurst(t.x, 0.5, t.z, 4, 10);
      if (t.timer <= 0) this.tornadoes.splice(i, 1);
    }

    if (wantedStars >= 5) {
      this.pipeBurstTimer += dt;
      if (this.pipeBurstTimer > 0.35) {
        this.pipeBurstTimer = 0;
        const spots = [[-10, -20], [10, -20], [0, -8], [-15, 15], [15, 15]];
        const [bx, bz] = spots[Math.floor(Math.random() * spots.length)];
        this.spawnWaterSpray(bx, 0.5, bz, 0, 15, 0, 14, 5);
        this.createWaterPuddle(bx, bz, 5.5);
      }
    }

    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i];
      ex.life -= dt;
      ex.scale += (ex.maxScale - ex.scale) * dt * 12;
      ex.mesh.scale.setScalar(ex.scale);
      ex.mesh.material.opacity = Math.max(0, ex.life * 2);
      if (ex.life <= 0) {
        this.scene.remove(ex.mesh);
        this.explosions.splice(i, 1);
      }
    }

    for (const m of this.missionRings) m.ringMesh.rotation.y += dt * 1.8;

    let waterDirty = false;
    for (let i = 0; i < this.WATER_PARTICLE_COUNT; i++) {
      const p = this.waterParticles[i];
      if (p.active) {
        waterDirty = true;
        p.life -= dt;
        p.vy -= 22 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; }
        if (p.life <= 0) { p.active = false; this.dummyObj.position.set(0, -100, 0); }
        else { this.dummyObj.position.set(p.x, p.y, p.z); this.dummyObj.scale.setScalar(p.scale); }
        this.dummyObj.updateMatrix();
        this.waterInstancedMesh.setMatrixAt(i, this.dummyObj.matrix);
      }
    }
    if (waterDirty) this.waterInstancedMesh.instanceMatrix.needsUpdate = true;

    let paperDirty = false;
    for (let i = 0; i < this.PAPER_PARTICLE_COUNT; i++) {
      const p = this.paperParticles[i];
      if (p.active) {
        paperDirty = true;
        p.life -= dt;
        for (const t of this.tornadoes) {
          const dx = p.x - t.x, dz = p.z - t.z;
          if (Math.hypot(dx, dz) < 5.5) {
            p.vx += (-dz * 5 - dx * 1.5) * dt;
            p.vz += (dx * 5 - dz * 1.5) * dt;
            p.vy = Math.max(p.vy, 4.5);
          }
        }
        p.vy -= 4.5 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.rx += dt * 5; p.ry += dt * 7;
        if (p.y < 0.06) { p.y = 0.06; p.vx *= 0.85; p.vz *= 0.85; }
        if (p.life <= 0) { p.active = false; this.dummyObj.position.set(0, -100, 0); }
        else { this.dummyObj.position.set(p.x, p.y, p.z); this.dummyObj.rotation.set(p.rx, p.ry, p.rz); this.dummyObj.scale.set(1, 1, 1); }
        this.dummyObj.updateMatrix();
        this.paperInstancedMesh.setMatrixAt(i, this.dummyObj.matrix);
      }
    }
    if (paperDirty) this.paperInstancedMesh.instanceMatrix.needsUpdate = true;
  }
}
