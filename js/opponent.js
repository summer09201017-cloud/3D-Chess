/* opponent.js — 這一站的 🐾 動物對手接線(本站專屬;動物引擎 animals.js、人聲 voice.js、three-shim.js 三支與 skill animal-opponent-kit 同一份,不在這裡改)
 *
 * 對手是誰就坐誰:簡單 🐰 白兔 / 中等 🐱 橘貓 / 困難 🐻 棕熊;📅 每日殘局 = 🦉 貓頭鷹守黑方。這站永遠對 AI ⇒ 永遠有一隻(除非關掉)。
 * ★ 本站世界是 **Y-up**(棋盤躺 XZ、camera.up = +Y)—— 跟引擎一樣 ⇒ 不用轉父群組,座位 / lookAt 直接照 gomoku3d 那套。
 * ★ 座位永遠在「相機的對面」:每幀量相機方位角(2° 一格),變了就重擺 —— 玩黑棋(相機在 -z)牠坐 +z、🔃 換邊也跟著坐到對面。
 *   坐的距離 = 底座半寬(fit.js BOARD.halfX 4.5,照方向取方形盤緣)+ 1.25 × scale(掌心搭到盤沿)。
 * ★ 相機讓位:board3d.fitExtra(dir) 回牠的頭頂(+EAR_ROOM),fit.js computeFit 把距離最多拉到 1.28 倍(棋盤最多縮 ~22%);正俯視(≥76°)不讓。
 * ★ 純觀感:不進 raycast、不進 AI、不影響棋力。三段 voice / mute / off 記在 localStorage。
 */
import * as THREE from 'three';
import { AnimalFigures, ANIMALS, HEAD_TOP_LOCAL_Y } from './animals.js';

export { ANIMALS };
export const LEVEL_ANIMAL = { easy: 'rabbit', medium: 'cat', hard: 'bear' };
export const PET_KEY = 'chess3d-pet';
export const PET_MODES = ['voice', 'mute', 'off'];
export function loadPetMode() { try { const v = localStorage.getItem(PET_KEY); return PET_MODES.includes(v) ? v : 'voice'; } catch { return 'voice'; } }
export function savePetMode(m) { try { localStorage.setItem(PET_KEY, m); } catch { /* 私密模式:這場有效 */ } }
/** 這一局該坐哪一隻(daily = 每日殘局) */
export function animalFor(daily, difficulty) {
  if (daily) return 'owl';
  return LEVEL_ANIMAL[difficulty] || 'cat';
}

const SEAT = 'ai';
/* 棋盤外接盒:跟 js/fit.js 的 BOARD 同一份(底座 9×9 ⇒ 半寬 4.5;底座底面 -0.55);格面 y ≈ 0.1 */
function boardBox() { const F = (typeof window !== 'undefined' && window.ChessFit) ? window.ChessFit.BOARD : null; return F || { halfX: 4.5, halfZ: 4.5, bottom: -0.55 }; }
const SURFACE_Y = 0.1;
/* 動物多大?照 gomoku3d / 3D-Xiangqi 的比例(半盤 × 0.215/1.3;半盤 4.5 ⇒ 0.744):頭直徑 ≈ 1.56 = 一格半、比國王高一點,頭頂離盤面 ≈ 2.8(盤寬的 1/3)。 */
const SCALE_PER_HALF = 0.215 / 1.3;
const PITCH_HIDE = 76;      // 俯角 ≥ 這個就不為牠讓位(正俯視看不到牠)
const YAW_STEP_DEG = 2;     // 相機方位角每差 2° 才重擺(OrbitControls 阻尼期間每幀都在微動)
const EAR_ROOM = 0.55;      // 取景點比頭頂再高一點,貓 / 熊耳尖才不會貼邊被切(本地單位)

export class Opponent {
  constructor(board3d, voice) {
    this.b = board3d;
    this.voice = voice || null;
    this.figs = new AnimalFigures(board3d.scene);
    this.kind = null;
    this.mode = loadPetMode();
    this._seatKey = null;
    this.thinkCount = 0;
    this.chat = { idleMs: 0, said: 0, first: 15000, every: 30000, max: 2, log: [] };
    board3d.fitExtra = (dir) => this.fitPoints(dir);
  }
  get on() { return this.mode !== 'off' && !!this.kind; }
  get voiceOn() { return this.mode === 'voice'; }
  get emoji() { return this.kind ? ANIMALS[this.kind].emoji : ''; }
  get name() { return this.kind ? ANIMALS[this.kind].name : ''; }
  get figure() { return this.figs.bySeat(SEAT); }

  setMode(m) {
    if (!PET_MODES.includes(m)) return false;
    this.mode = m; savePetMode(m);
    this.figs.setVisible(this.on);
    this.b.fitCamera({ keepDirection: true });
    return true;
  }

  /** 每局開始叫一次:換人就換動物;null 收起 */
  seat(kind) {
    if (kind !== this.kind) {
      this.kind = kind;
      if (!kind) this.figs.remove(SEAT);
      else this.figs.setKind(SEAT, kind, this._placement());
      this._seatKey = this._key();
    }
    this.figs.setVisible(this.on);
    this.figs.cancel(SEAT);
    this.chat.idleMs = 0; this.chat.said = 0; this.thinkCount = 0;
    this.b.fitCamera({ keepDirection: true });
  }

  /* ── 幾何:相機方位(世界 XZ)、盤緣距離、大小、凳深 ── */
  _dir(dir) {
    if (dir) { const n = Math.hypot(dir.x, dir.y, dir.z) || 1; return { x: dir.x / n, y: dir.y / n, z: dir.z / n }; }
    const cam = this.b.camera, t = this.b.controls ? this.b.controls.target : null;
    if (!cam) return { x: 0, y: 0.6, z: 0.8 };
    const v = cam.position.clone(); if (t) v.sub(t);
    const n = v.length() || 1;
    return { x: v.x / n, y: v.y / n, z: v.z / n };
  }
  _geom(dir) {
    const B = boardBox();
    const halfX = B.halfX, halfZ = B.halfZ;
    const scale = Math.max(halfX, halfZ) * SCALE_PER_HALF;
    const d = this._dir(dir);
    const h = Math.hypot(d.x, d.z) || 1;                    // 只取水平分量
    const ux = d.x / h, uz = d.z / h;
    const edge = Math.min(halfX / Math.max(Math.abs(ux), 1e-6), halfZ / Math.max(Math.abs(uz), 1e-6));   // 方形盤緣沿這個方向多遠
    const R = edge + 1.25 * scale;                          // 掌心(本地 z≈1.34)剛好搭到盤沿
    const dy = SURFACE_Y - 0.4 * scale;                     // 掌心(本地 y 0.4)落在格面
    const floorY = B.bottom;
    const legDrop = (dy - floorY) / scale;                  // 凳底落到底座底(makeAnimal 有 0.7 的下限,再深也只是伸到桌底、看不到)
    return { scale, R, dy, legDrop, floorY, ux, uz, pitchDeg: Math.asin(Math.max(-1, Math.min(1, d.y))) * 180 / Math.PI };
  }
  _key() { const g = this._geom(); return Math.round(Math.atan2(g.ux, g.uz) * 180 / Math.PI / YAW_STEP_DEG); }
  /** 相機在 (ux, uz) 那邊 ⇒ 牠坐 (-ux R, -uz R),臉朝盤心 */
  _placement() {
    const g = this._geom();
    return { pos: { x: -g.ux * g.R, y: 0, z: -g.uz * g.R }, lookAt: { x: 0, z: 0 }, scale: g.scale, dy: g.dy, legDrop: g.legDrop };
  }
  /** 取景點:頭頂 + 耳朵的世界座標(照 fitCamera 決定的方向算,不等人物真的擺過去) */
  fitPoints(dir) {
    if (!this.on) return [];
    const g = this._geom(dir);
    if (g.pitchDeg >= PITCH_HIDE) return [];
    return [[-g.ux * g.R, g.dy + (HEAD_TOP_LOCAL_Y + EAR_ROOM) * g.scale, -g.uz * g.R]];
  }

  /** 🐾 反應 + 🗣 人聲同一個入口(沒動物 ⇒ 全部略過) */
  react(kind, voiceEvent, delayMs = 0) {
    if (!this.kind) return false;
    const ok = this.figs.react(SEAT, kind);
    if (voiceEvent && this.on && this.voiceOn && this.voice) this.voice.say(this.kind, voiceEvent, delayMs);
    return ok;
  }
  /** 🤔 AI 開始想:姿勢每次都做,人聲每三手唸一次(太頻繁會煩) */
  think() { this.thinkCount++; return this.react('think', this.thinkCount % 3 === 1 ? 'think' : null); }
  cancel() { this.figs.cancel(SEAT); }

  /** 每幀:相機方位變了就重擺;idle;閒聊計時(waiting = 正在等你走) */
  update(dt, { focus = null, waiting = false, reduced = false } = {}) {
    if (this.kind) {
      const k = this._key();
      if (k !== this._seatKey) { this._seatKey = k; this.figs.place(SEAT, this._placement()); }
    }
    this.figs.update(dt, { focus, turn: null, reduced });
    const c = this.chat;
    if (!waiting || !this.on) { c.idleMs = 0; c.said = 0; return; }
    c.idleMs += dt * 1000;
    if (c.said >= c.max || c.idleMs < c.first + c.said * c.every) return;
    c.said++;
    const ev = 'chat' + (1 + Math.floor(Math.random() * 3));
    c.log.push(ev); if (c.log.length > 20) c.log.shift();
    this.react('chat', ev);
  }
  /** 任何輸入 ⇒ 你在動,閒聊計時歸零 */
  noteInput() { this.chat.idleMs = 0; this.chat.said = 0; }

  headTop() { return this.figs.headTop(SEAT); }
  /** smoke 用:一次把「哪一隻、看不看得到、頭頂在不在畫面、凳子有沒有落地、坐哪邊」量出來(螢幕 px 照畫布算) */
  probe() {
    const f = this.figure;
    if (!f) return { kind: this.kind, on: this.on, figure: false, mode: this.mode };
    const cam = this.b.camera;
    const top = this.figs.headTop(SEAT).project(cam);
    const ctr = this.figs.headCenter(SEAT).project(cam);
    const stool = f.group.localToWorld(new THREE.Vector3(0, -f.pose.legDrop, 0));
    const rect = this.b.renderer.domElement.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    const px = (v) => ({ x: rect.left + (v.x + 1) / 2 * W, y: rect.top + (1 - v.y) / 2 * H });
    const c = px(ctr), t = px(top), rad = Math.hypot(c.x - t.x, c.y - t.y);
    return {
      kind: this.kind, on: this.on, figure: true, visible: f.group.visible, mode: this.mode,
      head: { x: +top.x.toFixed(3), y: +top.y.toFixed(3), inside: Math.abs(top.x) <= 1 && Math.abs(top.y) <= 1 },
      headBox: { l: Math.round(c.x - rad), t: Math.round(c.y - rad), r: Math.round(c.x + rad), b: Math.round(c.y + rad) },   // 視窗 px,驗「臉沒被 HUD 蓋到」
      stoolY: +stool.y.toFixed(3), floorY: this._geom().floorY,
      pos: { x: +f.group.position.x.toFixed(2), z: +f.group.position.z.toFixed(2) },   // 相機在 +z(白方)時牠在 -z
      scale: +f.pose.scale.toFixed(3),
    };
  }
}
