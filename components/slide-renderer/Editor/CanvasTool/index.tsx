'use client';

import { useState } from 'react';
import { useCanvasStore } from '@/lib/store/canvas';
import { useSnapshotStore } from '@/lib/store/snapshot';
import {
  Undo, Redo, Search, Type, Maximize, SquareMousePointer,
  ZoomOut, ZoomIn, LineSquiggle, Sigma, Omega,
  Shapes, ImageIcon, PieChart, Table2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';

const minZoom = 30;
const maxZoom = 200;

export function CanvasTool() {
  // Canvas store state
  const _creatingElement = useCanvasStore.use.creatingElement();
  const _creatingCustomShape = useCanvasStore.use.creatingCustomShape();
  const _showSelectPanel = useCanvasStore.use.showSelectPanel();
  const _showSearchPanel = useCanvasStore.use.showSearchPanel();
  const canvasPercentage = useCanvasStore.use.canvasPercentage();
  const _canvasScale = useCanvasStore.use.canvasScale();

  const setCreatingElement = useCanvasStore.use.setCreatingElement();
  const _setCreatingCustomShapeState = useCanvasStore.use.setCreatingCustomShapeState();
  const _setSelectPanelState = useCanvasStore.use.setSelectPanelState();
  const _setSearchPanelState = useCanvasStore.use.setSearchPanelState();
  const setCanvasPercentage = useCanvasStore.use.setCanvasPercentage();

  const { canUndo: _canUndo, canRedo: _canRedo, undo: _undo, redo: _redo } = useSnapshotStore();

  // Local state for popovers
  const [_moreVisible, _setMoreVisible] = useState(false);
  const [_textTypeVisible, _setTextTypeVisible] = useState(false);
  const [_shapePoolVisible, _setShapePoolVisible] = useState(false);
  const [_shapeMenuVisible, _setShapeMenuVisible] = useState(false);
  const [_imageMenuVisible, _setImageMenuVisible] = useState(false);
  const [_linePoolVisible, _setLinePoolVisible] = useState(false);
  const [_chartPoolVisible, _setChartPoolVisible] = useState(false);
  const [_tableGeneratorVisible, _setTableGeneratorVisible] = useState(false);
  const [_canvasScaleVisible, _setCanvasScaleVisible] = useState(false);

  const _drawText = (vertical = false) => {
    setCreatingElement({ type: 'text', vertical });
  };

  const _toggleSelectPanel = () => {
    _setSelectPanelState(!_showSelectPanel);
  };

  const _toggleSearchPanel = () => {
    _setSearchPanelState(!_showSearchPanel);
  };

  const onZoomIn = () => {
    setCanvasPercentage(Math.min(canvasPercentage + 10, 200));
  };

  const onZoomOut = () => {
    setCanvasPercentage(Math.max(canvasPercentage - 10, 30));
  };

  const onZoomReset = () => {
    setCanvasPercentage(90);
  };

  const canZoomIn = canvasPercentage < maxZoom;
  const canZoomOut = canvasPercentage > minZoom;

  return (
    <div className="flex items-center justify-between px-3 py-3 border-b">
      <div className="flex items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <Undo className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>撤销</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <Redo className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>重做</p>
          </TooltipContent>
        </Tooltip>
        <Separator orientation="vertical" className="mx-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <SquareMousePointer className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>选择窗格</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <Search className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>查找/替换</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="flex items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <Type className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>插入文字</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <Shapes className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>插入形状</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <ImageIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>插入图片</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <LineSquiggle className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>插入线条</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <PieChart className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>插入图表</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <Table2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>插入表格</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <Sigma className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>插入公式</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <Omega className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>插入符号</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onZoomOut} disabled={!canZoomOut}>
              <ZoomOut className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>缩小</p>
          </TooltipContent>
        </Tooltip>

        <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-md">
        <span className="text-sm font-medium min-w-[3ch] text-right">
          {Math.round(canvasPercentage)}
        </span>
          <span className="text-sm text-muted-foreground">%</span>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onZoomIn} disabled={!canZoomIn}>
              <ZoomIn className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>放大</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onZoomReset} title="重置缩放">
              <Maximize className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>适应屏幕</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
