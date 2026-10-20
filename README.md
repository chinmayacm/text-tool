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

1. A fresh project starts with an **Input** node connected to an **Output** node—or expand **Templates** in the sidebar to load a ready-made pipeline (**Rows to Quoted List**, **Quoted List to Rows**, **Clean & Filter Lines**, **Merge Two Lists**, **Unmerge JSON Key-Values**, **Sort & Deduplicate Tag Rows**, **Compare Two Lists (A − B)**, **CSV Columns to SQL Inserts**, or **Partition & Count Log Errors**).
2. Drag operation nodes from the **Nodes** section onto the canvas (or drop them directly onto an existing connection line to splice them in). Nodes in the sidebar are grouped by role (**I/O**, **Structure & Combine**, and **Transform & Filter**), and hovering over any node for a moment shows a short description of what it does.
3. Select a node to edit its settings in the **Properties** panel (hover the `?` icon in the Properties header for a quick summary of the node type) and inspect its result in **Preview**.
4. Click **Process Now** on the **Output** node to evaluate the full graph, then copy or download the result.

Each sidebar section (**Project**, **Templates**, **Nodes**) can be minimized or expanded by clicking its header. Every node header on the canvas displays a live data-shape badge (**`Rows`**, **`Single`**, or **`Empty`**) so you can see at a glance whether a step outputs multiple rows or a single combined string.

## Nodes

Select a node to see its settings in the Properties panel. You can rename any node with the **Name** field; the new label is also shown on the canvas and in the preview. Delimiter, prefix/suffix, and trim character fields also display per-character token pills below the input so spaces, tabs, and special symbols are immediately visible.

### Input

Input is the starting point for text data. Choose **Paste** to type or paste text, or **File** to load a `.txt` or `.csv` file.

Choose how the source becomes rows:

- **Newline** splits at each line break.
- **Custom** splits at the literal delimiter you enter. The special strings `\\n` and `\\t` represent a line break and tab. For example, enter `,` to split on commas.
- **Whole** keeps the entire source as one value.

CSV is handled as text, not by a quote-aware CSV parser. For example, splitting a CSV line on commas will also split commas inside quoted fields. Use **Newline** to keep each record together, then add a Split or Unmerge node to divide its fields if that is appropriate for your data.

Live previews evaluate lazily up to the active row or character limit (from either the **Head** or **Tail** of the input). File-backed live previews read only a bounded portion of a file: at most 256 KiB, 200 rows, or 8,000 characters, depending on the selected split mode and preview limits. Choosing **All** in Preview does not bypass these file-preview safety caps. **Process Now** reads the complete file and evaluates the graph; large files can therefore require significant device memory.

### Split

Split each input row into multiple vertical rows. Enter a delimiter such as `,`, `|`, `\\n`, or `\\t`. Turn on **Treat delimiter as regex** to use a JavaScript regular expression, for example `[,;]` to split on commas or semicolons. Empty trailing segments and surrounding line breaks are stripped automatically so splitting multiline or trailing-delimiter values does not insert blank rows. With an empty delimiter, rows pass through unchanged.

### Join

Combine all input rows into one row, placing the configured **Delimiter** between them (supports `\n` and `\t` escapes). For example, joining `apple`, `banana`, and `carrot` with `, ` produces `apple, banana, carrot`. Enable **Skip empty rows before joining** to ignore blank rows so double delimiters do not appear.

### Merge

Merge two connected inputs row by row. Connect the primary input to the blue **A** handle and the second input to the amber **B** handle (each row inside the node also displays the connected upstream node's name). Set the **Join Delimiter** (supports `\n` and `\t`) to the text between each pair, and optionally set a **Fallback for missing row**.

If one input contains one row and the other contains several, the single row is repeated for each row of the longer input. Otherwise, the longer input determines the result length and missing values use the fallback.

### Unmerge

Split each input row horizontally into two parallel outputs—the exact inverse of **Merge**:

- **Output A** (blue **A** handle): receives the text **before** the delimiter for every row.
- **Output B** (amber **B** handle): receives the remainder of the row **after** the delimiter.
- **Split at**: choose **First occurrence** or **Last occurrence** of the delimiter.
- **Fallback for missing delimiter (Output B)**: if a row does not contain the delimiter, Output A keeps the full row and Output B receives this fallback value (blank by default) so row indices remain aligned across both outputs.
- **Splitting into 3+ columns**: because Output B holds the rest of the row after the first delimiter, you can chain another **Unmerge** node onto Output B to split into three or more columns.

### Compare

Compare two connected row lists (**Input A** and **Input B**) using standard set operations:

- **Difference (`A − B`)**: keep rows in Input A that do not appear in Input B.
- **Intersection (`A ∩ B`)**: keep rows present in both Input A and Input B.
- **Symmetric difference (`A Δ B`)**: keep rows that appear in only one of the two inputs.
- **Union (`A ∪ B`)**: combine all rows from Input A followed by Input B.
- **Case sensitive**, **Ignore outer whitespace when comparing**, and **Deduplicate output rows** toggles.

### Partition

Route rows into two parallel outputs based on a pattern match—acting like a non-destructive **Filter** with two branches:

- **Output A** (blue **A** handle): receives rows that match **Pattern**.
- **Output B** (amber **B** handle): receives rows that do not match **Pattern**.
- Supports literal text or regular expressions (**Treat pattern as regex**) and **Case sensitive** matching.

### Slice

Keep a subset of rows by position or step:

- **Skip ends**: skip the first $N$ rows (e.g., CSV header) and/or last $N$ rows (e.g., footer).
- **Line range**: keep lines from **Start line** to **End line** (1-based, inclusive; `0` = until the end).
- **Every Nth**: sample every $N$th row starting from a 1-based offset line.

### Append

Append uses connected **Input A** as the main rows and **Input B** as the added text. If B is not connected or has no rows, it uses the **Static text** field. A non-empty B input takes precedence over static text.

Choose a scope and side:

- **Every row** adds text to the start or end of every existing row. If B has multiple rows, its values are paired by row; rows without a matching B value receive no added text.
- **One row** adds text to the start or end of the numbered line. Line numbers start at 1.
- **New rows** inserts the text as separate rows. Static text is split at line breaks. With **Start**, line 0 inserts at the beginning and a positive line number inserts before that line. With **End**, line 0 inserts at the end and a positive line number inserts after that line.

### Trim

Remove leading and/or trailing whitespace—or custom user-defined symbols—from every row. Choose **Both ends**, **Start only**, or **End only**, and optionally specify **Characters to trim** (for example `{}, ` or `'"`). Any character you type into **Characters to trim** is stripped from the selected ends of each row in a single pass; leave it empty to strip whitespace by default. Turn on **Collapse multiple internal spaces to one** to normalize repeated spaces/tabs inside each row into a single space.

### Enclose

Add a **Prefix** and **Suffix** (supporting `\n` and `\t` escapes) to every row. For example, prefix `"` and suffix `"` turns `apple` into `"apple"`. Enable **Skip empty rows** to leave blank rows untouched instead of wrapping them into empty quotes.

### Replace

Set **Find** and **Replace with** (supporting `\n` and `\t` escapes) to substitute text in every row. By default, Find is literal text (and literal `$` symbols in **Replace with** are preserved safely); enable **Treat find as regex** to use a JavaScript regular expression with `$1`, `$2` capture groups. Toggle **Case sensitive** or **Replace all occurrences** as needed.

### Case

Choose **UPPER CASE**, **lower case**, **Title Case**, **Sentence case**, or developer identifier formats: **camelCase**, **PascalCase**, **snake_case**, **kebab-case**, and **CONSTANT_CASE**.

### Filter

Keep only rows matching **Pattern**, or enable **Treat pattern as regex** to use a JavaScript regular expression. Toggle **Case sensitive**, **Invert (exclude matches)**, or **Remove empty / blank rows** (which can also be used on its own with an empty pattern to strip blank lines).

### Sort

Sort rows vertically, sort delimited values inside each row, or both:

- **Scope**:
  - **Rows**: sorts the list of rows vertically.
  - **By delimiter**: splits each row (or a single-line string like `a,e,g,b`) by the configured **In-row delimiter**, sorts the items inside that row (`a,b,e,g`), and joins them back.
  - **Both**: first sorts the delimited values inside every row, and then sorts all resulting rows vertically.
- **Trim whitespace around delimited items**: enabled by default when sorting by delimiter so inputs like `a, e, g, b` sort cleanly without leading spaces skewing the order.
- **Order**: choose **Ascending (A → Z)** or **Descending (Z → A)**.
- **Comparison mode**: choose **Natural** (`item2 < item10`), **Alphabetical** (standard ASCII / lexicographical order), **Numeric** (`-5 < 2 < 10.5`), or **Length** (shortest to longest).
- **Case sensitive** & **Remove duplicates (unique)**: toggle case-sensitive comparison or deduplicate identical rows/items while sorting.

### Unique

Deduplicate rows in their original order of appearance or filter by frequency:

- **Deduplicate**: keep the first occurrence of every distinct row.
- **Duplicates**: keep only rows that appear 2 or more times.
- **Singles only**: keep only rows that appear once.
- **Prepend occurrence count**: prefix each output row with its count and a configurable **Count separator** (for example `3 × apple`).

### Number

Add sequential numbering to the **Prefix (start)** or **Suffix (end)** of each row, with configurable **Start number**, **Step increment**, **Zero-pad width** (e.g., `2` produces `01`, `02`), **Separator** (e.g., `. `), and **Skip empty rows**.

### Extract

Pull out a specific part of each row using one of three modes:

- **Column**: split each row by **Delimiter** and pick a 1-based **Column number** (or negative to count from the end, e.g., `-1` for the last column).
- **Between**: extract the substring between **Start delimiter** and **End delimiter** (for example between `[` and `]`).
- **Regex**: extract a regular expression match or specific **Capture group** (`0` = full match, `1+` = group).
- Rows without a match can either be dropped (**Drop rows without a match**) or replaced with **Fallback when not found**.

### Pad / Cut

Pad rows to a fixed character width (**Pad end**, **Pad start**, or **Pad both** using a **Pad character**) or **Truncate to max width** with an optional **Ellipsis suffix** (`…`).

### Template

Format each row into a custom string pattern using placeholders:

- `{row}` — the full input row
- `{i}` — 1-based row number (`1`, `2`, `3`…)
- `{i0}` — 0-based row number (`0`, `1`, `2`…)
- `{col1}`, `{col2}`, `{col3}`… — columns split by the configured **Column delimiter**

### Output

Output marks the end of a graph and provides full processing and export controls:

- **Process Now** reads complete file inputs and evaluates the full graph, then shows the processing time and number of rows.
- **Output Filename** sets the downloaded filename.
- **Copy Output** copies the full processed output when available; before processing, it copies the current preview.
- **Download Output** downloads the full processed output when available; before processing, it downloads the current preview.

## Preview

Select any node to view its output in the Preview panel:

- **Mode badge**: indicates whether the selected node's output is **Multiline (rows)**, **Single line**, or **Empty**.
- **Output A / Output B toggle**: when an **Unmerge** node is selected, switch between inspecting **Output A** and **Output B**.
- **Head / Tail & Limit controls**: choose **Head** (first items) or **Tail** (last items), and pick a row limit (`5`, `10`, `50`, `Custom`, or `All rows`) for multiline results or a character limit (`100`, `500`, `1000`, `Custom`, or `All chars`) for single-line results. Both **Head** and **Tail** slices are evaluated lazily from the start or end of the input.
- **Lazy vs. Full status badge**: the header badge shows **`Lazy`** when a row/character limit is active, switches to **`Full`** when `All` is selected on pasted text, and shows **`Lazy (Cap)`** when `All` is selected with a file input (since live file previews stay capped until **Process Now** is clicked).
- **Lazy sort notice**: when inspecting a **Sort** node (or any node downstream of **Sort**) while preview is in **Lazy** mode, a notice banner reminds you that only the sampled preview slice is sorted and that the final full-dataset order may differ until you select **All** or click **Process Now**.

The Preview panel can copy or download the currently displayed preview without running full processing.

## Canvas Controls

- **Add a node:** drag it from the left palette onto the canvas.
- **Connect nodes & smart handles:** drag from a node's output handle (outward triangle `▸`/`▾`/`◂`/`▴`) to another node's input handle (inward triangle). Single-input nodes accept one incoming connection at a time—connecting a new node automatically replaces the previous incoming connection. Handles automatically snap to the closest side of the node (**Top**, **Right**, **Bottom**, or **Left**) based on the angle to connected neighbors, and space themselves along the edge so multiple connections on the same side never overlap.
- **Magnetic connect:** slowly drag an existing node over another node, or drag a palette node over one. Wait for the target to glow, then release to connect. For existing nodes, a quick yank cancels the magnetic connection. Left feeds right in horizontal layouts, and top feeds bottom in vertical layouts.
- **Insert into an edge:** drop a palette node over a connection line to splice it into that connection. To splice an existing node, hold Ctrl (Windows/Linux) or Cmd (macOS) while dropping it on an edge.
- **Select multiple nodes:** Ctrl-click (Windows/Linux) or Cmd-click (macOS) to add or remove a node from the selection. Drag on empty canvas to box-select.
- **Copy and paste nodes:** select one or more nodes, focus the canvas, then press Ctrl+C and Ctrl+V (Cmd+C and Cmd+V on macOS). Copies include connections between selected nodes and are placed with an offset. Text fields keep their normal copy/paste behavior.
- **Delete & auto-reconnect:** select nodes or edges and press Delete or Backspace. Deleting an intermediate node `B` in `A → B → C` automatically reconnects `A → C`.
- **Remove one connection:** right-click its edge.
- **Pan:** scroll, middle-drag, right-drag, or hold Space while dragging.
- **Zoom and navigation:** use the canvas controls or mouse wheel; the mini-map helps navigate larger graphs.

## Save, Export, and Reset

The latest project is automatically saved in IndexedDB, the browser's local storage database. Autosave includes the graph, node settings, canvas position, preview limits, and uploaded file contents. The Project area in the sidebar shows the save status.

Local autosave is tied to this browser and device. It does not sync to another device, and clearing the browser's site data can remove it.

- **Export project** opens a dialog where you can enter a custom file name and downloads a `.texttool` archive containing the graph and its uploaded files. Export is a manual backup; the archive does not update when you continue editing.
- **Open project** loads a `.texttool` archive and replaces the current project and autosave.
- **Start fresh** asks for confirmation, clears the current graph and attached files, resets the canvas to the default connected **Input → Output** starter nodes, and saves it in place of the previous autosave. Export first if you want to keep a copy.

## Data Policy

TextTool has no application backend. Text, graph data, and uploaded files are processed in the browser and are not uploaded to a TextTool server. Autosave stores the latest project and its files in browser storage on the device. Use **Documentation** and **Data policy** at the bottom of the sidebar to view this guide or the privacy notice from the app.

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