# Tiptap 富文本编辑器组件 Skill

## 概述

这是一个基于 **Tiptap** 实现的功能完整的富文本编辑器组件，适用于 React + TypeScript + Tailwind CSS 项目。组件采用飞书风格设计，支持编辑和只读模式，功能丰富且开箱即用。

## 核心特性

### 📝 文本格式化
- **标题**：H1、H2、H3 三级标题
- **基础样式**：加粗、斜体、下划线、删除线
- **文字颜色**：9 种预设颜色 + 默认
- **背景高亮**：8 种荧光笔颜色
- **字体大小**：小/正常/中/大/特大/超大

### 📋 列表与结构
- **无序列表**：蓝色圆点样式
- **有序列表**：多级编号 (1 → a → i → 1)
- **待办事项**：可勾选的任务列表
- **引用块**：带彩色边框，支持自定义颜色
- **分隔线**

### 💻 代码支持
- **行内代码**：`code` 样式
- **代码块**：带行号 + 语法高亮（基于 lowlight）

### 🔗 链接与表格
- **超链接**：工具栏和浮动菜单添加
- **表格**：插入、调整列宽、右键菜单增删行列

### ✨ 高级特性
- **Markdown 粘贴**：自动检测并转换 Markdown 格式
- **浮动工具栏**：选中文本时显示快捷格式工具
- **快捷键支持**：完整的键盘快捷键（Mac/Windows 适配）
- **只读模式**：轻量级 Viewer 组件

---

## 依赖安装

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/pm \
  @tiptap/extension-underline \
  @tiptap/extension-task-list @tiptap/extension-task-item \
  @tiptap/extension-placeholder \
  @tiptap/extension-code-block-lowlight \
  @tiptap/extension-text-style @tiptap/extension-color \
  @tiptap/extension-highlight \
  @tiptap/extension-table @tiptap/extension-table-row \
  @tiptap/extension-table-cell @tiptap/extension-table-header \
  @tiptap/extension-link \
  lowlight marked
```

### UI 组件依赖（基于 shadcn/ui）
- `Button`
- `Input`
- `Separator`
- `Tooltip`, `TooltipContent`, `TooltipProvider`, `TooltipTrigger`
- `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger`, `DropdownMenuLabel`
- `ContextMenu`, `ContextMenuContent`, `ContextMenuItem`, `ContextMenuSeparator`, `ContextMenuTrigger`

### 图标依赖（lucide-react）
```typescript
import { 
  BoldIcon, ItalicIcon, UnderlineIcon, StrikethroughIcon,
  Heading1Icon, Heading2Icon, Heading3Icon,
  ListIcon, ListOrderedIcon, ListTodoIcon,
  Undo2Icon, Redo2Icon,
  CodeIcon, SquareCodeIcon,
  QuoteIcon, MinusIcon,
  PaletteIcon, HighlighterIcon, TypeIcon,
  ChevronDownIcon, TableIcon, PlusIcon, Trash2Icon,
  ColumnsIcon, RowsIcon, LinkIcon, UnlinkIcon,
} from 'lucide-react'
```

---

## 使用方法

### 基本使用

```tsx
import { RichTextEditor, RichTextViewer } from '@/components/ui/rich-text-editor'

// 编辑模式
function EditPage() {
  const [content, setContent] = useState('<p>初始内容</p>')
  
  return (
    <RichTextEditor
      content={content}
      onChange={setContent}
      placeholder="请输入内容..."
    />
  )
}

// 只读模式
function ViewPage() {
  return (
    <RichTextViewer 
      content={savedHtmlContent}
      className="prose"
    />
  )
}
```

### Props 接口

```typescript
interface RichTextEditorProps {
  /** 内容（HTML 格式） */
  content?: string
  /** 是否只读 */
  readonly?: boolean
  /** 内容变化回调 */
  onChange?: (html: string) => void
  /** 自定义类名 */
  className?: string
  /** 占位符 */
  placeholder?: string
}
```

---

## 组件结构

```
RichTextEditor
├── 工具栏 (Toolbar)
│   ├── 撤销/重做
│   ├── 标题 H1/H2/H3
│   ├── 文本格式（加粗/斜体/下划线/删除线）
│   ├── 字体大小
│   ├── 文字颜色/背景高亮
│   ├── 代码/代码块
│   ├── 列表（无序/有序/待办）
│   ├── 引用/分隔线
│   ├── 超链接
│   └── 表格
├── 编辑区域 (EditorContent)
│   └── 表格右键菜单 (TableContextMenu)
└── 浮动工具栏 (FloatingToolbar)
```

---

## CSS 样式要点

需要在全局样式中添加 `.rich-text-content` 和 `.rich-text-editor` 的样式：

### 关键样式类

```css
/* 富文本内容容器 */
.rich-text-content {
  line-height: 1.75;
  font-size: 0.9375rem;
}

/* 标题样式 */
.rich-text-content h1 { font-size: 1.625rem; font-weight: 600; }
.rich-text-content h2 { font-size: 1.25rem; font-weight: 600; }
.rich-text-content h3 { font-size: 1.0625rem; font-weight: 600; }

/* 无序列表蓝色圆点 */
.rich-text-content ul > li::before {
  content: "•";
  color: #3370ff;
}

/* 有序列表多级编号 */
.rich-text-content ol > li::before { content: counter(list-level1) "."; }
.rich-text-content ol ol > li::before { content: counter(list-level2, lower-alpha) "."; }
.rich-text-content ol ol ol > li::before { content: counter(list-level3, lower-roman) "."; }

/* 引用块彩色边框 */
.rich-text-content blockquote {
  border-left: 3px solid #3370ff;
  padding-left: 0.75rem;
}

/* 代码块行号 */
.code-block-with-lines {
  display: flex;
  background-color: var(--muted);
  border-radius: 0.5rem;
}
.line-numbers {
  padding: 1rem 0.5rem;
  text-align: right;
  color: var(--muted-foreground);
  user-select: none;
}

/* 表格样式 */
.rich-text-content table {
  border-collapse: collapse;
  border: 1px solid var(--border);
}
.rich-text-content table th { background-color: var(--muted); }
```

完整样式请参考源文件中的 CSS 定义（约 500 行）。

---

## 快捷键

| 功能 | Mac | Windows |
|------|-----|---------|
| 撤销 | ⌘Z | Ctrl+Z |
| 重做 | ⌘⇧Z | Ctrl+Y |
| 标题1 | ⌘⌥1 | Ctrl+Alt+1 |
| 标题2 | ⌘⌥2 | Ctrl+Alt+2 |
| 标题3 | ⌘⌥3 | Ctrl+Alt+3 |
| 加粗 | ⌘B | Ctrl+B |
| 斜体 | ⌘I | Ctrl+I |
| 下划线 | ⌘U | Ctrl+U |
| 删除线 | ⌘⇧S | Ctrl+Shift+S |
| 行内代码 | ⌘E | Ctrl+E |
| 代码块 | ⌘⌥C | Ctrl+Alt+C |
| 无序列表 | ⌘⇧8 | Ctrl+Shift+8 |
| 有序列表 | ⌘⇧7 | Ctrl+Shift+7 |
| 待办事项 | ⌘⇧9 | Ctrl+Shift+9 |
| 引用 | ⌘⇧B | Ctrl+Shift+B |

---

## 扩展自定义

### 自定义 Tiptap 扩展示例

```typescript
// 自定义字体大小扩展
const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: el => el.style.fontSize,
          renderHTML: attrs => attrs.fontSize 
            ? { style: `font-size: ${attrs.fontSize}` } 
            : {}
        }
      }
    }]
  },
  addCommands() {
    return {
      setFontSize: (size: string) => ({ chain }) => 
        chain().setMark('textStyle', { fontSize: size }).run()
    }
  }
})

// Markdown 粘贴扩展
const MarkdownPaste = Extension.create({
  name: 'markdownPaste',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData('text/plain')
            if (text && looksLikeMarkdown(text)) {
              // 转换 Markdown 为 HTML 并插入
              const html = marked.parse(text)
              // ...
              return true
            }
            return false
          }
        }
      })
    ]
  }
})
```

---

## 源文件位置

- **组件**：`site/src/components/ui/rich-text-editor.tsx`
- **样式**：`site/src/index.css`（搜索 `.rich-text-content`）

## 使用示例

- 报告结论编辑：`site/src/components/report-detail/description-card.tsx`
- 任务描述编辑：`site/src/components/task-detail/task-description-card.tsx`

---

## 常见问题

### 1. 如何自定义预设颜色？
修改组件中的 `TEXT_COLORS`、`HIGHLIGHT_COLORS`、`BLOCKQUOTE_COLORS` 数组。

### 2. 如何添加新的工具栏按钮？
在 `ToolbarButton` 组件基础上添加，使用 `editor.chain().focus().yourCommand().run()` 执行命令。

### 3. 表格无法调整列宽？
确保 `Table` 扩展配置了 `resizable: true`，并添加了列调整手柄的 CSS 样式。

### 4. Markdown 粘贴不生效？
检查是否正确引入了 `marked` 库，以及 `MarkdownPaste` 扩展是否添加到 extensions 数组中。
