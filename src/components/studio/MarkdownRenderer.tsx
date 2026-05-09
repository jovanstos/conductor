import type { ReactNode } from 'react'

// ── Inline parser: bold, italic, inline code, links ──────────────────
function parseInline(text: string, baseKey: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let remaining = text
  let k = 0

  while (remaining.length > 0) {
    // Inline code: `code`
    const codeM = remaining.match(/^`([^`]+)`/)
    if (codeM) {
      nodes.push(
        <code key={`${baseKey}-c${k++}`} style={{
          background: 'rgba(255,255,255,0.10)',
          border: '1px solid rgba(255,255,255,0.12)',
          padding: '1px 6px',
          borderRadius: '4px',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.88em',
          color: 'var(--c-text-1)',
        }}>
          {codeM[1]}
        </code>
      )
      remaining = remaining.slice(codeM[0].length)
      continue
    }

    // Bold+italic: ***text***
    const boldItalicM = remaining.match(/^\*\*\*(.+?)\*\*\*/)
    if (boldItalicM) {
      nodes.push(<strong key={`${baseKey}-bi${k++}`}><em>{boldItalicM[1]}</em></strong>)
      remaining = remaining.slice(boldItalicM[0].length)
      continue
    }

    // Bold: **text** or __text__
    const boldM = remaining.match(/^\*\*(.+?)\*\*/) || remaining.match(/^__(.+?)__/)
    if (boldM) {
      nodes.push(<strong key={`${baseKey}-b${k++}`} style={{ color: 'var(--c-text-1)', fontWeight: 700 }}>{boldM[1]}</strong>)
      remaining = remaining.slice(boldM[0].length)
      continue
    }

    // Italic: *text* or _text_
    const italicM = remaining.match(/^\*([^*]+)\*/) || remaining.match(/^_([^_]+)_/)
    if (italicM) {
      nodes.push(<em key={`${baseKey}-i${k++}`}>{italicM[1]}</em>)
      remaining = remaining.slice(italicM[0].length)
      continue
    }

    // Advance one char or to next potential marker
    const nextMarker = remaining.search(/`|\*|_/)
    if (nextMarker <= 0) {
      nodes.push(remaining)
      break
    }
    nodes.push(remaining.slice(0, nextMarker))
    remaining = remaining.slice(nextMarker)
  }

  return nodes
}

// ── Block types ───────────────────────────────────────────────────────
type Block =
  | { type: 'h1' | 'h2' | 'h3' | 'h4'; text: string }
  | { type: 'hr' }
  | { type: 'code'; lang: string; code: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'blockquote'; text: string }
  | { type: 'p'; text: string }
  | { type: 'blank' }

// ── Parse markdown string into blocks ────────────────────────────────
function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = []
  const lines = markdown.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code block: ```lang
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      blocks.push({ type: 'code', lang, code: codeLines.join('\n') })
      continue
    }

    // Headings
    const h4 = line.match(/^####\s+(.+)/)
    if (h4) { blocks.push({ type: 'h4', text: h4[1] }); i++; continue }
    const h3 = line.match(/^###\s+(.+)/)
    if (h3) { blocks.push({ type: 'h3', text: h3[1] }); i++; continue }
    const h2 = line.match(/^##\s+(.+)/)
    if (h2) { blocks.push({ type: 'h2', text: h2[1] }); i++; continue }
    const h1 = line.match(/^#\s+(.+)/)
    if (h1) { blocks.push({ type: 'h1', text: h1[1] }); i++; continue }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ type: 'hr' }); i++; continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2))
        i++
      }
      blocks.push({ type: 'blockquote', text: quoteLines.join('\n') })
      continue
    }

    // Unordered list
    if (/^(\s*[-*+]\s)/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^(\s*[-*+]\s)/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s/, ''))
        i++
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''))
        i++
      }
      blocks.push({ type: 'ol', items })
      continue
    }

    // Blank line
    if (line.trim() === '') {
      blocks.push({ type: 'blank' })
      i++
      continue
    }

    // Paragraph — collect consecutive non-special lines
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('```') &&
      !lines[i].startsWith('> ') &&
      !/^(\s*[-*+]\s)/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'p', text: paraLines.join('\n') })
    }
  }

  return blocks
}

// ── Render a single block ────────────────────────────────────────────
function renderBlock(block: Block, index: number): ReactNode {
  const key = `block-${index}`

  switch (block.type) {
    case 'blank':
      return null

    case 'hr':
      return <hr key={key} style={{ border: 'none', borderTop: '1px solid var(--c-border)', margin: '1rem 0' }} />

    case 'h1':
      return (
        <h1 key={key} style={{ fontSize: '1.4em', fontWeight: 800, color: 'var(--c-text-1)', margin: '1.2em 0 0.4em', lineHeight: 1.3 }}>
          {parseInline(block.text, key)}
        </h1>
      )
    case 'h2':
      return (
        <h2 key={key} style={{ fontSize: '1.2em', fontWeight: 700, color: 'var(--c-text-1)', margin: '1.1em 0 0.35em', lineHeight: 1.3 }}>
          {parseInline(block.text, key)}
        </h2>
      )
    case 'h3':
      return (
        <h3 key={key} style={{ fontSize: '1.05em', fontWeight: 700, color: 'var(--c-text-1)', margin: '1em 0 0.3em', lineHeight: 1.3 }}>
          {parseInline(block.text, key)}
        </h3>
      )
    case 'h4':
      return (
        <h4 key={key} style={{ fontSize: '0.95em', fontWeight: 600, color: 'var(--c-text-2)', margin: '0.8em 0 0.25em', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {parseInline(block.text, key)}
        </h4>
      )

    case 'code':
      return (
        <pre
          key={key}
          style={{
            background: 'rgba(0,0,0,0.35)',
            border: '1px solid var(--c-border)',
            borderRadius: '8px',
            padding: '12px 16px',
            margin: '0.75em 0',
            overflowX: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.82em',
            lineHeight: 1.6,
            color: 'var(--c-text-1)',
            whiteSpace: 'pre',
          }}
        >
          {block.lang && (
            <span style={{ display: 'block', color: 'var(--c-text-3)', fontSize: '0.78em', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {block.lang}
            </span>
          )}
          {block.code}
        </pre>
      )

    case 'blockquote':
      return (
        <blockquote
          key={key}
          style={{
            borderLeft: '3px solid var(--c-accent)',
            paddingLeft: '16px',
            margin: '0.75em 0',
            color: 'var(--c-text-2)',
            fontStyle: 'italic',
          }}
        >
          {parseInline(block.text, key)}
        </blockquote>
      )

    case 'ul':
      return (
        <ul key={key} style={{ margin: '0.5em 0', paddingLeft: '20px', listStyleType: 'none' }}>
          {block.items.map((item, j) => (
            <li key={j} style={{ color: 'var(--c-text-1)', marginBottom: '0.2em', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--c-accent)', flexShrink: 0, marginTop: '0.35em', fontSize: '0.55em', lineHeight: 1 }}>●</span>
              <span>{parseInline(item, `${key}-li${j}`)}</span>
            </li>
          ))}
        </ul>
      )

    case 'ol':
      return (
        <ol key={key} style={{ margin: '0.5em 0', paddingLeft: '0', listStyleType: 'none', counterReset: 'item' }}>
          {block.items.map((item, j) => (
            <li key={j} style={{ color: 'var(--c-text-1)', marginBottom: '0.2em', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--c-accent)', fontFamily: 'var(--font-mono)', fontSize: '0.85em', fontWeight: 700, flexShrink: 0, minWidth: '18px' }}>
                {j + 1}.
              </span>
              <span>{parseInline(item, `${key}-li${j}`)}</span>
            </li>
          ))}
        </ol>
      )

    case 'p': {
      const lines = block.text.split('\n')
      return (
        <p key={key} style={{ color: 'var(--c-text-1)', lineHeight: 1.7, margin: '0.4em 0' }}>
          {lines.map((line, j) => (
            <span key={j}>
              {parseInline(line, `${key}-p${j}`)}
              {j < lines.length - 1 && <br />}
            </span>
          ))}
        </p>
      )
    }

    default:
      return null
  }
}

// ── Main export ──────────────────────────────────────────────────────
export default function MarkdownRenderer({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  const blocks = parseBlocks(content)

  return (
    <div
      className={className}
      style={{ lineHeight: 1.65, wordBreak: 'break-word' }}
    >
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  )
}
