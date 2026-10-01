import { ReactFlowProvider } from "@xyflow/react";
import { Sidebar } from "./components/Sidebar";
import { Canvas } from "./components/Canvas";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import "./App.css";

function App() {
  return (
    <ReactFlowProvider>
      <div className="app">
        <Sidebar />
        <Canvas />
        <div className="inspector">
          <PropertiesPanel />
          <PreviewPanel />
        </div>
      </div>
    </ReactFlowProvider>
  );
}

export default App;
