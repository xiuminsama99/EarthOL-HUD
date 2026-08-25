/**
 * 宠物形象（工单 04，SVG 手绘，AI 图后置）
 *
 * 静态形象即可：三只简洁圆脸角色（猫 / 狗 / 小恐龙），按品种 id 渲染。
 * 表情随心情联动、动画等均为后续迭代，不在本工单。
 */
import type { CSSProperties } from 'react'

const svg: CSSProperties = { display: 'block', width: '100%', height: 'auto' }

/** 猫：圆脸 + 三角耳 + 胡须 */
function Cat() {
  return (
    <svg viewBox="0 0 100 100" style={svg} role="img" aria-label="猫">
      <ellipse cx="50" cy="72" rx="27" ry="19" fill="#f4a7b9" />
      <circle cx="50" cy="42" r="20" fill="#f4a7b9" />
      <polygon points="33,31 37,11 49,25" fill="#f4a7b9" />
      <polygon points="67,31 63,11 51,25" fill="#f4a7b9" />
      <polygon points="36,26 38,15 46,24" fill="#f9c9d5" />
      <polygon points="64,26 62,15 54,24" fill="#f9c9d5" />
      <circle cx="43" cy="42" r="2.6" fill="#2d2d4a" />
      <circle cx="57" cy="42" r="2.6" fill="#2d2d4a" />
      <path d="M50 46 L47.5 50 L52.5 50 Z" fill="#ff8fa3" />
      <path d="M40 51 C44 53, 47 52, 50 51" stroke="#e08a9c" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <line x1="31" y1="46" x2="41" y2="48" stroke="#e08a9c" strokeWidth="1" strokeLinecap="round" />
      <line x1="31" y1="53" x2="41" y2="51" stroke="#e08a9c" strokeWidth="1" strokeLinecap="round" />
      <line x1="69" y1="46" x2="59" y2="48" stroke="#e08a9c" strokeWidth="1" strokeLinecap="round" />
      <line x1="69" y1="53" x2="59" y2="51" stroke="#e08a9c" strokeWidth="1" strokeLinecap="round" />
      <path d="M34 78 Q50 86 66 78" stroke="#2d2d4a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  )
}

/** 狗：圆脸 + 垂耳 + 微笑嘴 */
function Dog() {
  return (
    <svg viewBox="0 0 100 100" style={svg} role="img" aria-label="狗">
      <ellipse cx="50" cy="74" rx="28" ry="18" fill="#d9b98a" />
      <circle cx="50" cy="44" r="21" fill="#d9b98a" />
      <ellipse cx="27" cy="46" rx="7" ry="16" fill="#c49a68" transform="rotate(-12 27 46)" />
      <ellipse cx="73" cy="46" rx="7" ry="16" fill="#c49a68" transform="rotate(12 73 46)" />
      <ellipse cx="27" cy="52" rx="3.4" ry="10" fill="#b0824e" transform="rotate(-12 27 52)" />
      <ellipse cx="73" cy="52" rx="3.4" ry="10" fill="#b0824e" transform="rotate(12 73 52)" />
      <circle cx="43" cy="44" r="2.8" fill="#2d2d4a" />
      <circle cx="57" cy="44" r="2.8" fill="#2d2d4a" />
      <ellipse cx="50" cy="51" rx="3.4" ry="2.6" fill="#2d2d4a" />
      <path d="M44 57 Q50 61 56 57" stroke="#2d2d4a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M36 78 Q50 86 64 78" stroke="#2d2d4a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  )
}

/** 小恐龙：圆身 + 背刺 + 小尾巴 */
function Dino() {
  return (
    <svg viewBox="0 0 100 100" style={svg} role="img" aria-label="小恐龙">
      <ellipse cx="50" cy="62" rx="26" ry="22" fill="#7ce3a8" />
      <circle cx="66" cy="42" r="14" fill="#7ce3a8" />
      <circle cx="62" cy="42" r="2.2" fill="#2d2d4a" />
      <circle cx="71" cy="42" r="2.2" fill="#2d2d4a" />
      <path d="M64 49 Q67 52 70 49" stroke="#2d2d4a" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <polygon points="38,38 42,26 46,38" fill="#5ccb8a" />
      <polygon points="46,32 50,20 54,32" fill="#5ccb8a" />
      <polygon points="54,34 58,23 62,35" fill="#5ccb8a" />
      <path d="M78 66 Q92 64 84 78 Q76 88 66 80" fill="#5ccb8a" />
      <path d="M40 84 Q50 90 60 84" stroke="#2d2d4a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  )
}

/** 按品种 id 渲染形象 */
export function PetArt({ breed }: { breed: string }) {
  if (breed === 'cat') return <Cat />
  if (breed === 'dog') return <Dog />
  return <Dino />
}
