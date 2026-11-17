// js/vehicles.js
// GTA 核心玩法 1：可搶奪駕駛的 4 大 3D 惡搞載具系統（穩定街機剛體物理與車載特技）

import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class VehicleManager {
  constructor(scene, physicsWorld, audio, gameWorld, callbacks = {}) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;
    this.audio = audio;
    this.gameWorld = gameWorld;
    this.callbacks = callbacks;

    this.vehicles = [];
    this.currentVehicle = null;
    this.strikeComboCount = 0;
    this.strikeResetTimer = 0;

    this.spawnAllVehicles();
  }

  spawnAllVehicles() {
    this.createVehicle({
      type: 'turbo_chair', name: '渦輪改裝辦公轉椅',
      x: 0, z: -7, yaw: Math.PI, maxSpeed: 22, accel: 34, turnSpeed: 3.4, mass: 65,
      size: { w: 1.1, h: 1.3, d: 1.1 }, color: 0xe11d48
    });
    this.createVehicle({
      type: 'turbo_chair', name: '渦輪改裝辦公轉椅 II號',
      x: -11, z: -21, yaw: 0, maxSpeed: 22, accel: 34, turnSpeed: 3.4, mass: 65,
      size: { w: 1.1, h: 1.3, d: 1.1 }, color: 0x0284c7
    });
    this.createVehicle({
      type: 'forklift', name: '倉庫電動堆高機',
      x: 9, z: 15, yaw: -Math.PI * 0.75, maxSpeed: 18, accel: 28, turnSpeed: 2.7, mass: 220,
      size: { w: 1.8, h: 2.2, d: 2.8 }, color: 0xf59e0b
    });
    this.createVehicle({
      type: 'pickup', name: '工務處工程小貨車',
      x: -8, z: 18, yaw: Math.PI, maxSpeed: 26, accel: 36, turnSpeed: 2.5, mass: 380,
      size: { w: 2.3, h: 2.1, d: 4.4 }, color: 0x0284c7
    });
    this.createVehicle({
      type: 'water_tanker', name: '高壓清洗水車',
      x: 0, z: 28, yaw: Math.PI, maxSpeed: 21, accel: 30, turnSpeed: 2.1, mass: 620,
      size: { w: 2.7, h: 2.9, d: 5.8 }, color: 0x00b4d8
    });
  }

  createVehicle(cfg) {
    const group = new THREE.Group();
    const { w, h, d } = cfg.size;
    let forkGroup = null;
    let turretGroup = null;
    let beaconMesh = null;

    if (cfg.type === 'turbo_chair') {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.15, 10), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
      base.position.y = -h / 2 + 0.15;
      group.add(base);

      const seatMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.5 });
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.14, 0.75), seatMat);
      seat.position.y = -0.1;
      group.add(seat);

      const back = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.14), seatMat);
      back.position.set(0, 0.35, -0.32);
      group.add(back);

      [-0.22, 0.22].forEach((tx) => {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.62, 10), new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.4 }));
        tank.position.set(tx, 0.35, -0.46);
        group.add(tank);
      });
    } else if (cfg.type === 'forklift') {
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, d * 0.72), new THREE.MeshStandardMaterial({ color: 0xf59e0b }));
      chassis.position.set(0, -0.35, -0.25);
      group.add(chassis);

      const cage = new THREE.Mesh(new THREE.BoxGeometry(w * 0.88, 1.1, d * 0.55), new THREE.MeshStandardMaterial({ color: 0x1e293b, wireframe: true }));
      cage.position.set(0, 0.55, -0.25);
      group.add(cage);

      const mastMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6 });
      [-0.48, 0.48].forEach((mx) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.3, 0.14), mastMat);
        rail.position.set(mx, 0.25, d * 0.36);
        group.add(rail);
      });

      forkGroup = new THREE.Group();
      forkGroup.position.set(0, -0.55, d * 0.42);
      forkGroup.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.1), mastMat));
      [-0.38, 0.38].forEach((fx) => {
        const prong = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 1.35), mastMat);
        prong.position.set(fx, -0.12, 0.68);
        forkGroup.add(prong);
      });
      group.add(forkGroup);
    } else if (cfg.type === 'pickup') {
      const lower = new THREE.Mesh(new THREE.BoxGeometry(w, 0.85, d), new THREE.MeshStandardMaterial({ color: 0x0284c7 }));
      lower.position.y = -0.35;
      group.add(lower);

      const cab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.85, d * 0.45), new THREE.MeshStandardMaterial({ color: 0xf8fafc }));
      cab.position.set(0, 0.45, 0.25);
      group.add(cab);

      beaconMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.22, 12), new THREE.MeshBasicMaterial({ color: 0xf59e0b }));
      beaconMesh.position.set(0, 0.98, 0.25);
      group.add(beaconMesh);
    } else if (cfg.type === 'water_tanker') {
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, d), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
      chassis.position.y = -0.65;
      group.add(chassis);

      const cab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.95, 1.45, d * 0.28), new THREE.MeshStandardMaterial({ color: 0x0284c7 }));
      cab.position.set(0, 0.35, d * 0.34);
      group.add(cab);

      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, d * 0.64, 16), new THREE.MeshStandardMaterial({ color: 0x00b4d8, metalness: 0.25 }));
      tank.rotation.x = Math.PI / 2;
      tank.position.set(0, 0.45, -d * 0.14);
      group.add(tank);

      turretGroup = new THREE.Group();
      turretGroup.position.set(0, 1.68, 0.2);
      turretGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0xfacc15 })));
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.35, 10), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.15, 0.65);
      turretGroup.add(barrel);
      group.add(turretGroup);
    }

    if (cfg.type !== 'turbo_chair') {
      const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 10);
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
      const wx = w * 0.48, wz = d * 0.34;
      [[-wx, -wz], [wx, -wz], [-wx, wz], [wx, wz]].forEach(([x, z]) => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, -h / 2 + 0.42, z);
        group.add(wheel);
      });
    }

    group.position.set(cfg.x, h / 2 + 0.05, cfg.z);
    group.rotation.y = cfg.yaw || 0;
    this.scene.add(group);

    const body = new CANNON.Body({
      mass: cfg.mass,
      shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)),
      position: new CANNON.Vec3(cfg.x, h / 2 + 0.05, cfg.z),
      linearDamping: 0.45,
      angularDamping: 0.85
    });
    body.quaternion.setFromEuler(0, cfg.yaw || 0, 0);
    body.angularFactor.set(0, 1, 0);
    this.physicsWorld.addBody(body);

    const vehicle = {
      ...cfg, mesh: group, body, yaw: cfg.yaw || 0, speed: 0,
      forkGroup, forkHeight: 0, carriedNPC: null, carriedProp: null,
      turretGroup, turretYaw: 0, beaconMesh
    };
    this.vehicles.push(vehicle);
    return vehicle;
  }

  findNearestVehicle(pos, maxDist = 4.3) {
    let best = null;
    let bestDist = maxDist;
    for (const v of this.vehicles) {
      const d = Math.hypot(v.body.position.x - pos.x, v.body.position.z - pos.z);
      if (d < bestDist) {
        bestDist = d;
        best = v;
      }
    }
    return best;
  }

  triggerForkliftAction(v, npcManager) {
    if (!v || v.type !== 'forklift') return;
    this.audio.playSFX('punch');

    if (v.carriedNPC || v.carriedProp) {
      const forwardX = Math.sin(v.yaw);
      const forwardZ = Math.cos(v.yaw);

      if (v.carriedNPC) {
        const npc = v.carriedNPC;
        v.carriedNPC = null;
        npc.isCarried = false;
        npc.body.position.set(
          v.body.position.x + forwardX * 2.8,
          v.body.position.y + 2.2,
          v.body.position.z + forwardZ * 2.8
        );
        npc.body.velocity.set(forwardX * 24, 10, forwardZ * 24);
        npcManager.knockdownNPC(npc, '啊！堆高機把我甩飛啦！', true);
        if (this.callbacks.onPopup) {
          this.callbacks.onPopup(npc.body.position, '🚜 堆高機高空甩飛主管！+$6,000', '#ffbe0b');
        }
        if (this.callbacks.onDamageAdded) {
          this.callbacks.onDamageAdded(6000, '堆高機甩飛主管', npc.body.position);
        }
      }

      if (v.carriedProp) {
        const prop = v.carriedProp;
        v.carriedProp = null;
        prop.body.wakeUp();
        prop.body.velocity.set(forwardX * 22, 9, forwardZ * 22);
      }

      v.forkHeight = 0;
      return;
    }

    v.forkHeight = v.forkHeight < 0.8 ? 1.55 : 0.0;
    const forkTipX = v.body.position.x + Math.sin(v.yaw) * 2.3;
    const forkTipZ = v.body.position.z + Math.cos(v.yaw) * 2.3;

    if (npcManager) {
      const targetNPC = npcManager.findNearestNPC(forkTipX, forkTipZ, 3.4);
      if (targetNPC) {
        v.carriedNPC = targetNPC;
        targetNPC.isCarried = true;
        targetNPC.setExpression('shock');
        npcManager.showBubble(targetNPC, '救命啊！別用堆高機把本課長舉高高！', true);
        v.forkHeight = 1.65;
        if (this.callbacks.onPopup) {
          this.callbacks.onPopup(targetNPC.body.position, '🚜 成功鏟起主管！再按 [E/特技] 甩飛進水池！', '#ffbe0b');
        }
      }
    }
  }

  update(dt, input, npcManager, aimYaw = 0) {
    if (this.strikeResetTimer > 0) {
      this.strikeResetTimer -= dt;
      if (this.strikeResetTimer <= 0) this.strikeComboCount = 0;
    }

    for (const v of this.vehicles) {
      const isDriven = this.currentVehicle === v;

      if (isDriven) {
        const throttle = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
        const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
        const drifting = input.jump;

        if (throttle !== 0) {
          v.speed += throttle * v.accel * dt;
          v.speed = Math.max(-v.maxSpeed * 0.55, Math.min(v.maxSpeed, v.speed));
        } else {
          v.speed *= Math.pow(0.15, dt);
        }

        if (Math.abs(v.speed) > 0.4) {
          const dirSign = v.speed >= 0 ? 1 : -1;
          const driftBonus = drifting ? 1.55 : 1.0;
          v.yaw += steer * v.turnSpeed * driftBonus * dirSign * dt;
        }

        const forwardX = Math.sin(v.yaw);
        const forwardZ = Math.cos(v.yaw);
        const grip = drifting ? 0.86 : 0.96;

        v.body.velocity.x = v.body.velocity.x * (1 - grip) + forwardX * v.speed * grip;
        v.body.velocity.z = v.body.velocity.z * (1 - grip) + forwardZ * v.speed * grip;
        v.body.quaternion.setFromEuler(0, v.yaw, 0);

        if (v.type === 'turbo_chair' && Math.abs(v.speed) > 4) {
          this.gameWorld.spawnWaterSpray(
            v.body.position.x - forwardX * 0.6,
            v.body.position.y,
            v.body.position.z - forwardZ * 0.6,
            -forwardX * 8, 2, -forwardZ * 8, 2, 1.5
          );
        }

        if (v.type === 'forklift' && v.forkGroup) {
          const targetY = -0.55 + v.forkHeight;
          v.forkGroup.position.y += (targetY - v.forkGroup.position.y) * dt * 10;

          if (v.carriedNPC) {
            const liftX = v.body.position.x + forwardX * 2.25;
            const liftZ = v.body.position.z + forwardZ * 2.25;
            const liftY = v.body.position.y + v.forkHeight + 0.5;
            v.carriedNPC.body.position.set(liftX, liftY, liftZ);
            v.carriedNPC.body.velocity.set(0, 0, 0);
          }
        }

        if (v.type === 'water_tanker' && v.turretGroup) {
          v.turretYaw = aimYaw - v.yaw;
          v.turretGroup.rotation.y = v.turretYaw;

          if (input.attack) {
            const nozzleX = v.body.position.x + Math.sin(aimYaw) * 1.4;
            const nozzleZ = v.body.position.z + Math.cos(aimYaw) * 1.4;
            const nozzleY = v.body.position.y + 1.8;
            const jetVx = Math.sin(aimYaw) * 26;
            const jetVz = Math.cos(aimYaw) * 26;

            this.gameWorld.spawnWaterSpray(nozzleX, nozzleY, nozzleZ, jetVx, 3.5, jetVz, 8, 2.6);
            if (Math.random() < 0.25) {
              this.audio.playSFX('water_jet');
              this.gameWorld.createWaterPuddle(nozzleX + Math.sin(aimYaw) * 8, nozzleZ + Math.cos(aimYaw) * 8, 4.8);
            }

            if (npcManager) {
              npcManager.blastNPCsAlongRay(nozzleX, nozzleZ, Math.sin(aimYaw), Math.cos(aimYaw), 18, 3.0, true);
            }
            for (const prop of this.gameWorld.destructibles) {
              if (!prop.broken) {
                const dx = prop.body.position.x - nozzleX;
                const dz = prop.body.position.z - nozzleZ;
                const proj = dx * Math.sin(aimYaw) + dz * Math.cos(aimYaw);
                const perp = Math.abs(dx * Math.cos(aimYaw) - dz * Math.sin(aimYaw));
                if (proj > 0 && proj < 16 && perp < 2.5) {
                  this.gameWorld.damageProp(prop, v.body.position, 18, npcManager);
                }
              }
            }
          }
        }

        const currentSpeed = Math.hypot(v.body.velocity.x, v.body.velocity.z);
        if (currentSpeed > 3.2) {
          const hitRadius = Math.max(v.size.w, v.size.d) * 0.62 + 0.65;

          for (const prop of this.gameWorld.destructibles) {
            if (!prop.broken) {
              const dist = Math.hypot(prop.body.position.x - v.body.position.x, prop.body.position.z - v.body.position.z);
              if (dist < hitRadius + 0.6) {
                this.gameWorld.damageProp(prop, v.body.position, currentSpeed * 1.25, npcManager);
              }
            }
          }

          if (npcManager) {
            const hitCount = npcManager.ramNPCsByVehicle(v, hitRadius, currentSpeed);
            if (hitCount > 0 && v.type === 'turbo_chair') {
              this.strikeComboCount += hitCount;
              this.strikeResetTimer = 4.0;
              const bonus = 5000 * this.strikeComboCount;
              if (this.callbacks.onComboBanner) {
                this.callbacks.onComboBanner(`🎳 STRIKE! 轉椅全倒連擊 x${this.strikeComboCount} (+$${bonus.toLocaleString()})`);
              }
              if (this.callbacks.onDamageAdded) {
                this.callbacks.onDamageAdded(bonus, 'STRIKE! 轉椅全倒連擊', v.body.position);
              }
            }
          }
        }
      }

      v.mesh.position.copy(v.body.position);
      v.mesh.quaternion.copy(v.body.quaternion);

      if (v.beaconMesh) {
        v.beaconMesh.material.color.setHex(Math.floor(performance.now() / 180) % 2 === 0 ? 0xf59e0b : 0xef4444);
      }
    }
  }
}
