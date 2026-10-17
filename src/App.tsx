import { ReactFlowProvider } from "@xyflow/react";
import { Sidebar } from "./components/Sidebar";
import { Canvas } from "./components/Canvas";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { useProjectPersistence } from "./store/useProjectPersistence";
import "./App.css";

function App() {
  const { ready, status, startFresh } = useProjectPersistence();

  if (!ready) {
    return <div className="project-loading">Loading your local project…</div>;
  }

  return (
    <ReactFlowProvider>
      <div className="app">
        <Sidebar saveStatus={status} onStartFresh={startFresh} />
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
