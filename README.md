# TextTool

TextTool is a browser-based node graph for transforming text and row-oriented data. Connect operations on the canvas, inspect a live preview at each node, and process or download the final output. The app has no backend: projects and uploaded files stay in the browser on your device.

## Start the App

Requirements: Node.js supported by Vite 8 and npm.

```bash
npm install
npm run dev
```

Open the URL printed by Vite. This project uses the `/text-tool/` base path, so the local address is typically `http://localhost:5173/text-tool/`. If that port is busy, Vite prints a different port.

To create and preview a production build:

```bash
npm run build
npm run preview
```

## Basic Workflow

1. Drag an **Input** node from the left palette onto the canvas.
2. Add operation nodes and connect them by dragging from a node's right-hand output handle to another node's left-hand input handle.
3. Select a node to edit its settings in the Properties panel and inspect its result in Preview.
4. Add an **Output** node at the end of the graph. Click **Process Now** to evaluate the full graph, then copy or download the result.

An Input node can feed several operations. Merge and Append can receive two inputs. Output nodes are optional while building a graph: every node has its own preview.

## Nodes

Select a node to see its settings in the Properties panel. You can rename any node with the **Name** field; the new label is also shown on the canvas and in the preview.

### Input

Input is the starting point for text data. Choose **Paste** to type or paste text, or **File** to load a `.txt` or `.csv` file.

Choose how the source becomes rows:

- **Newline** splits at each line break.
- **Custom** splits at the literal delimiter you enter. The special strings `\\n` and `\\t` represent a line break and tab. For example, enter `,` to split on commas.
- **Whole** keeps the entire source as one value.

CSV is handled as text, not by a quote-aware CSV parser. For example, splitting a CSV line on commas will also split commas inside quoted fields. Use **Newline** to keep each record together, then add a Split node to divide its fields if that is appropriate for your data.

File-backed live previews read only a bounded portion of a file: at most 256 KiB, 200 rows, or 8,000 characters, depending on the selected split mode and preview limits. Choosing **All** in Preview does not bypass these file-preview safety caps. **Process Now** reads the complete file and evaluates the graph; large files can therefore require significant device memory.

### Split

Split each input row into multiple rows. Enter a delimiter such as `,` or `|`. Turn on **Treat delimiter as regex** to use a JavaScript regular expression, for example `[,;]` to split on commas or semicolons. With an empty delimiter, rows pass through unchanged.

### Enclose

Add a **Prefix** and **Suffix** to every row. For example, prefix `"` and suffix `"` turns `apple` into `"apple"`.

### Join

Combine all input rows into one row, placing the configured **Delimiter** between them. For example, joining `apple`, `banana`, and `carrot` with `, ` produces `apple, banana, carrot`.

### Merge

Merge two connected inputs row by row. Connect the primary input to handle **A** and the second input to handle **B**. Set the **Join Delimiter** to the text between each pair, and optionally set a **Fallback for missing row**.

If one input contains one row and the other contains several, the single row is repeated for each row of the longer input. Otherwise, the longer input determines the result length and missing values use the fallback.

### Append

Append uses connected **Input A** as the main rows and **Input B** as the added text. If B is not connected or has no rows, it uses the **Static text** field. A non-empty B input takes precedence over static text.

Choose a scope and side:

- **Every row** adds text to the start or end of every existing row. If B has multiple rows, its values are paired by row; rows without a matching B value receive no added text.
- **One row** adds text to the start or end of the numbered line. Line numbers start at 1.
- **New rows** inserts the text as separate rows. Static text is split at line breaks. With **Start**, line 0 inserts at the beginning and a positive line number inserts before that line. With **End**, line 0 inserts at the end and a positive line number inserts after that line.

### Trim

Remove whitespace from every row. Choose **Both ends**, **Start only**, or **End only**.

### Replace

Set **Find** and **Replace with** to substitute text in every row. By default, Find is literal text; enable **Treat find as regex** to use a JavaScript regular expression. **Replace all occurrences** is enabled by default. Turn it off to replace only the first match in each row.

### Case

Choose **UPPER CASE**, **lower case**, **Title Case**, or **Sentence case**. Title Case capitalizes the start of each word. Sentence case capitalizes the first word and the first word after `.`, `!`, or `?`.

### Filter

Keep only rows matching **Pattern**, or enable **Treat pattern as regex** to use a JavaScript regular expression. Turn on **Invert (exclude matches)** to remove matching rows instead. An empty pattern leaves all rows unchanged.

### Output

Output marks the end of a graph and provides full processing and export controls:

- **Process Now** reads complete file inputs and evaluates the full graph, then shows the processing time and number of rows.
- **Output Filename** sets the downloaded filename.
- **Copy Output** copies the full processed output when available; before processing, it copies the current preview.
- **Download Output** downloads the full processed output when available; before processing, it downloads the current preview.

## Preview

Select any node to view its output in the Preview panel. For multiple-row results, choose a row limit of 5, 10, 50, a custom number, or All. For a single-row result, choose a character limit of 100, 500, 1,000, a custom number, or All. The preview is intended for quick inspection; use **Process Now** on an Output node to process the entire file-backed graph.

The Preview panel can copy or download the currently displayed preview without running full processing.

## Canvas Controls

- **Add a node:** drag it from the left palette onto the canvas.
- **Connect nodes:** drag from a source handle on the right of one node to an input handle on the left of another.
- **Magnetic connect:** slowly drag an existing node over another node, or drag a palette node over one. Wait for the target to glow, then release to connect. For existing nodes, a quick yank cancels the magnetic connection. The node on the left feeds the node on the right.
- **Insert into an edge:** drop a palette node over a connection line to splice it into that connection. To splice an existing node, hold Ctrl (Windows/Linux) or Cmd (macOS) while dropping it on an edge.
- **Select multiple nodes:** Ctrl-click (Windows/Linux) or Cmd-click (macOS) to add or remove a node from the selection. Drag on empty canvas to box-select.
- **Copy and paste nodes:** select one or more nodes, focus the canvas, then press Ctrl+C and Ctrl+V (Cmd+C and Cmd+V on macOS). Copies include connections between selected nodes and are placed with an offset. Text fields keep their normal copy/paste behavior.
- **Delete:** select nodes or edges and press Delete or Backspace.
- **Remove one connection:** right-click its edge.
- **Pan:** scroll, middle-drag, right-drag, or hold Space while dragging.
- **Zoom and navigation:** use the canvas controls or mouse wheel; the mini-map helps navigate larger graphs.

## Save, Export, and Reset

The latest project is automatically saved in IndexedDB, the browser's local storage database. Autosave includes the graph, node settings, canvas position, preview limits, and uploaded file contents. The Project area in the sidebar shows the save status.

Local autosave is tied to this browser and device. It does not sync to another device, and clearing the browser's site data can remove it.

- **Export project** downloads a `.texttool` archive containing the graph and its uploaded files. Export is a manual backup; the archive does not update when you continue editing.
- **Open project** loads a `.texttool` archive and replaces the current project and autosave.
- **Start fresh** asks for confirmation, clears the current graph and attached files, and immediately saves the empty project in place of the previous autosave. Export first if you want to keep a copy.

## Data Policy

TextTool has no application backend. Text, graph data, and uploaded files are processed in the browser and are not uploaded to a TextTool server. Autosave stores the latest project and its files in browser storage on the device. Use **Data policy** at the bottom of the sidebar to view this notice in the app.

## Development

```bash
npm run dev       # Start Vite
npm run build     # Typecheck and create a production build
npm run preview   # Serve the production build locally
npm run lint      # Lint source files
```

## Tech Stack

- React and TypeScript
- Vite
- `@xyflow/react` for the node graph
- Zustand for graph state
- `fflate` for project archive import and export
- `nanoid` for node and edge identifiers