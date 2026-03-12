'use client';

import { CanvasTool } from "./CanvasTool";
import Canvas from "./Canvas";
import type { StageMode } from "@/lib/types/stage";
import { ScreenCanvas } from "./ScreenCanvas";

/**
 * Slide Editor - wraps Canvas with SceneProvider
 *
 * Architecture:
 * - CanvasTool: Toolbar for Canvas operations
 * - Canvas: Main editing Canvas
 */
export function SlideEditor({ mode }: { readonly mode: StageMode }) {
  return (
    <div className="flex flex-col h-full">
      {mode === 'autonomous' && <CanvasTool />}
      <div className="flex-1 overflow-hidden">
        {mode === 'autonomous' ? <Canvas /> : <ScreenCanvas />}
      </div>
    </div>
  );
}
