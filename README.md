# TextTool - Node-Based Text Processing Environment

A visual, node-graph text transformation web application modeled after node editors like DaVinci Fusion. Designed for structured text manipulation, string wrangling, row operations, and dataset formatting with real-time lazy previewing.

![TextTool Workspace](./public/vite.svg)

---

## 🌟 Key Features

- 🎨 **Fusion-Style Node Canvas**: Drag, connect, move, and organize text operation nodes visually.
- ⚡ **Lazy Preview Engine**: Real-time evaluation bounded by row/character limits to preserve browser performance when working with large text files.
- 🚀 **Full Execution Pipeline**: Dedicated Output node with one-click full processing, execution time benchmarks, custom filenames, and one-click copy/download.
- 🧲 **Smart Canvas Interactions**:
  - **Snap-Connect**: Dragging connections near input/output handles snaps automatically (`connectionRadius={45}`).
  - **Drag-to-Splice**: Drop palette nodes or drag existing canvas nodes over connection lines while holding `Ctrl` (Windows/Linux) or `Cmd` (Mac) to automatically insert them between nodes.
  - **Right-Click Edge Deletion**: Context menu on connection lines removes edges cleanly without interfering with normal left-click selection.
  - **Key Bindings**: Press `Delete` or `Backspace` to remove selected nodes or connections.
  - **Live Node Renaming**: Custom labels update instantly across the node header, properties panel, and preview inspector.

---

## 🛠️ Available Operation Nodes

| Node | Purpose & Capabilities |
| :--- | :--- |
| **Input** | Main entry point. Supports pasting text with options for *Multiple rows (split by newline)* or *Single value (whole text)*. |
| **Split** | Splits each input row into multiple rows using plain-text or regular expression delimiters. |
| **Enclose** | Wraps every row individually with a custom prefix and suffix (e.g. `apple` $\to$ `"apple"`). |
| **Join** | Combines all input rows into a single string using a custom join delimiter (defaults to `,`). |
| **Merge** | Multi-input node ($A$ & $B$) that merges corresponding rows line-by-line, repeats single-line inputs across all rows, and supports custom missing-row fallbacks. |
| **Append** | Multi-input or static text node. Appends content either as *Next line* (new rows below) or *At the end* (inline suffix per row). |
| **Trim** | Strips whitespace from both ends, start-only, or end-only for every row. |
| **Replace** | Replaces matches using plain-text or regex with support for replace-all or single replacement. |
| **Case** | Converts text across `UPPER CASE`, `lower case`, `Title Case`, or `Sentence case`. |
| **Filter** | Filters text rows using exact strings or regular expressions, with optional match inversion (exclusion). |
| **Output** | Pipeline terminal node featuring **Process Now**, processing time benchmark (ms), output filename config, copy, and download. |

---

## 🖥️ Layout & Interface

1. **Node Palette (Left Sidebar)**: Drag operation cards directly onto the canvas.
2. **Graph Canvas (Center Area)**: Interactive canvas powered by React Flow with pan, zoom, mini-map, and smart node splicing.
3. **Inspector Panel (Right Sidebar)**:
   - **Properties Panel (Top)**: Fine-tune selected node parameters, rename nodes, or trigger full output processing.
   - **Preview Panel (Bottom)**: Live viewer for the selected node output. Automatically toggles between Row Limits (*5, 10, 50, custom, all*) and Character Limits (*100, 500, 1000, custom, all*) based on data shape.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- `npm` or `yarn`

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/TextTool.git

# Navigate to the project directory
cd TextTool

# Install dependencies
npm install
```

### Development Server

Start the local Vite development server with Hot Module Replacement (HMR):

```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

### Production Build

Typecheck and bundle the project for production deployment:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

---

## 💡 Workflow Examples

### Example 1: Enclose Items and Join into a CSV Line
1. Drag **Input** $\to$ **Enclose** $\to$ **Join** $\to$ **Output**.
2. Set **Enclose** Prefix/Suffix to `"`.
3. Set **Join** Delimiter to `, `.
4. **Input**: `apple\nbanana\ncarrot` $\to$ **Output**: `"apple", "banana", "carrot"`.

### Example 2: Merge Two Datasets with Delimiters
1. Drag **Input 1** (IDs) to **Merge** (Handle A).
2. Drag **Input 2** (Names) to **Merge** (Handle B).
3. Set **Merge** Delimiter to `: `.
4. **Output**: `ID_101: Alice`, `ID_102: Bob`.

---

## 🧰 Tech Stack

- **Framework**: [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Node Graph UI**: [@xyflow/react](https://reactflow.dev/) (React Flow)
- **State Management**: [Zustand](https://zustand-demo.pmnd.rs/)
- **Utility**: `nanoid`

---

## 📄 License

MIT License. Free for personal and commercial use.
