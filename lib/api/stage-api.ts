/**
 * Stage API - AI Agent Toolkit
 *
 * Provides a complete Stage operation interface for AI Agents to create and manage course content
 *
 * Design Principles:
 * 1. Type Safety: Fully leverage TypeScript's type system
 * 2. Ease of Use: Provide high-level abstractions with clear, intuitive API naming
 * 3. Extensibility: Support adding new scene types in the future
 * 4. Idempotency: Multiple calls with the same parameters produce the same result
 * 5. Error Handling: Return explicit success/failure status and error messages
 *
 * @example
 * ```typescript
 * const api = createStageAPI(stageStore);
 *
 * // Create a new scene
 * const sceneId = api.scene.create({
 *   type: 'slide',
 *   title: 'Introduction',
 *   // speech is now in actions
 * });
 *
 * // Add an element
 * const elementId = api.element.add(sceneId, {
 *   type: 'text',
 *   content: 'Hello World',
 *   left: 100,
 *   top: 100
 * });
 *
 * // Highlight an element (teaching feature)
 * api.canvas.highlight(sceneId, elementId, 3000);
 * ```
 */

import { nanoid } from "nanoid";
import type {
  Stage,
  Scene,
  SceneType,
  SceneContent,
  SlideContent,
  QuizContent,
  InteractiveContent,
  PBLContent,
  StageMode,
  Whiteboard,
} from "@/lib/types/stage";
import type {
  PPTElement,
  SlideTheme,
  SlideBackground,
} from "@/lib/types/slides";
import { useCanvasStore } from "@/lib/store/canvas";

// ==================== Type Definitions ====================

/**
 * API operation result
 */
export interface APIResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

import type { Action } from "@/lib/types/action";

/**
 * Scene creation parameters
 */
export interface CreateSceneParams {
  type: SceneType;
  title: string;
  content?: Partial<SceneContent>;
  order?: number;
  actions?: Action[];
}

/**
 * Element creation parameters (required fields)
 */
export type CreateElementParams = {
  type: PPTElement["type"];
  left: number;
  top: number;
  width: number;
  height: number;
  rotate?: number;
  [key: string]: unknown; // Allow other element-specific properties
};

/**
 * Highlight options
 */
export interface HighlightOptions {
  duration?: number; // milliseconds
  color?: string;
  style?: "outline" | "fill" | "shadow";
}

/**
 * Spotlight options
 */
export interface SpotlightOptions {
  duration?: number;
  radius?: number;
  dimness?: number; // 0-1, background dimming level
}

// ==================== Store Interface ====================

/**
 * Stage Store interface (for dependency injection)
 */
export interface StageStore {
  getState: () => {
    stage: Stage | null;
    scenes: Scene[];
    currentSceneId: string | null;
    mode: StageMode;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setState: (partial: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscribe: (listener: (state: any, prevState: any) => void) => () => void;
}

// ==================== Utility Functions ====================

/**
 * Generate a unique ID
 */
function generateId(prefix?: string): string {
  return prefix ? `${prefix}_${nanoid(10)}` : nanoid(10);
}

/**
 * Validate whether a Scene ID exists
 */
function validateSceneId(scenes: Scene[], sceneId: string): boolean {
  return scenes.some((s) => s.id === sceneId);
}

/**
 * Get a Scene
 */
function getScene(scenes: Scene[], sceneId: string): Scene | null {
  return scenes.find((s) => s.id === sceneId) || null;
}

/**
 * Create default SlideContent
 */
function createDefaultSlideContent(): SlideContent {
  return {
    type: "slide",
    canvas: {
      id: generateId("slide"),
      viewportSize: 1000,
      viewportRatio: 0.5625, // 16:9
      theme: {
        backgroundColor: "#ffffff",
        themeColors: ["#5b9bd5", "#ed7d31", "#a5a5a5", "#ffc000", "#4472c4"],
        fontColor: "#333333",
        fontName: "Microsoft YaHei",
        outline: {
          color: "#d14424",
          width: 2,
          style: "solid",
        },
        shadow: {
          h: 0,
          v: 0,
          blur: 10,
          color: "#000000",
        },
      },
      elements: [],
    },
  };
}

/**
 * Create default QuizContent
 */
function createDefaultQuizContent(): QuizContent {
  return {
    type: "quiz",
    questions: [],
  };
}

/**
 * Create default InteractiveContent
 */
function createDefaultInteractiveContent(): InteractiveContent {
  return {
    type: "interactive",
    url: "",
  };
}

/**
 * Create default PBLContent
 */
function createDefaultPBLContent(): PBLContent {
  return {
    type: "pbl",
    projectConfig: {
      projectInfo: { title: '', description: '' },
      agents: [],
      issueboard: { agent_ids: [], issues: [], current_issue_id: null },
      chat: { messages: [] },
    },
  };
}

/**
 * Create default Content based on type
 */
function createDefaultContent(type: SceneType): SceneContent {
  switch (type) {
    case "slide":
      return createDefaultSlideContent();
    case "quiz":
      return createDefaultQuizContent();
    case "interactive":
      return createDefaultInteractiveContent();
    case "pbl":
      return createDefaultPBLContent();
    default:
      throw new Error(`Unknown scene type: ${type}`);
  }
}

// ==================== Stage API Implementation ====================

/**
 * Create a Stage API instance
 *
 * @param store - Zustand store instance
 * @returns Stage API object
 */
export function createStageAPI(store: StageStore) {
  // ==================== Scene Management ====================

  const scene = {
    /**
     * Create a new scene
     *
     * @param params - Scene parameters
     * @returns Scene ID
     *
     * @example
     * const sceneId = api.scene.create({
     *   type: 'slide',
     *   title: 'Introduction',
     *   // speech is now in actions
     * });
     */
    create(params: CreateSceneParams): APIResult<string> {
      try {
        const state = store.getState();

        if (!state.stage) {
          return { success: false, error: "No stage set - cannot create scene without a stage" };
        }

        const sceneId = generateId("scene");

        // Determine order
        const order = params.order ?? state.scenes.length;

        // Create default content or use the provided content
        let content: SceneContent;
        if (params.content) {
          content = {
            ...createDefaultContent(params.type),
            ...params.content,
          } as SceneContent;
        } else {
          content = createDefaultContent(params.type);
        }

        const newScene: Scene = {
          id: sceneId,
          stageId: state.stage.id,
          type: params.type,
          title: params.title,
          order,
          content,
          actions: params.actions,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        const newScenes = [...state.scenes, newScene].sort(
          (a, b) => a.order - b.order,
        );

        store.setState({ scenes: newScenes });

        return { success: true, data: sceneId };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Delete a scene
     *
     * @param sceneId - Scene ID
     * @returns Whether successful
     */
    delete(sceneId: string): APIResult<boolean> {
      try {
        const state = store.getState();

        if (!validateSceneId(state.scenes, sceneId)) {
          return { success: false, error: `Scene not found: ${sceneId}` };
        }

        const newScenes = state.scenes.filter((s) => s.id !== sceneId);

        // If the deleted scene is the current one, switch to the next
        let newCurrentSceneId = state.currentSceneId;
        if (state.currentSceneId === sceneId) {
          newCurrentSceneId = newScenes.length > 0 ? newScenes[0].id : null;
        }

        store.setState({
          scenes: newScenes,
          currentSceneId: newCurrentSceneId,
        });

        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Update a scene
     *
     * @param sceneId - Scene ID
     * @param updates - Fields to update
     * @returns Whether successful
     */
    update(sceneId: string, updates: Partial<Scene>): APIResult<boolean> {
      try {
        const state = store.getState();

        if (!validateSceneId(state.scenes, sceneId)) {
          return { success: false, error: `Scene not found: ${sceneId}` };
        }

        const newScenes = state.scenes.map((scene) =>
          scene.id === sceneId
            ? { ...scene, ...updates, updatedAt: Date.now() }
            : scene,
        );

        store.setState({ scenes: newScenes });

        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Get all scenes
     *
     * @returns Scene list
     */
    list(): APIResult<Scene[]> {
      try {
        const state = store.getState();
        return { success: true, data: [...state.scenes] };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Get a specific scene
     *
     * @param sceneId - Scene ID
     * @returns Scene object
     */
    get(sceneId: string): APIResult<Scene> {
      try {
        const state = store.getState();
        const scene = getScene(state.scenes, sceneId);

        if (!scene) {
          return { success: false, error: `Scene not found: ${sceneId}` };
        }

        return { success: true, data: scene };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  };

  // ==================== Navigation ====================

  const navigation = {
    /**
     * Navigate to a specific scene
     *
     * @param sceneId - Scene ID
     * @returns Whether successful
     */
    goTo(sceneId: string): APIResult<boolean> {
      try {
        const state = store.getState();

        if (!validateSceneId(state.scenes, sceneId)) {
          return { success: false, error: `Scene not found: ${sceneId}` };
        }

        store.setState({ currentSceneId: sceneId });

        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Next scene
     *
     * @returns Whether successful
     */
    next(): APIResult<boolean> {
      try {
        const state = store.getState();

        if (!state.currentSceneId || state.scenes.length === 0) {
          return { success: false, error: "No current scene" };
        }

        const currentIndex = state.scenes.findIndex(
          (s) => s.id === state.currentSceneId,
        );
        if (currentIndex === -1 || currentIndex === state.scenes.length - 1) {
          return { success: false, error: "Already at last scene" };
        }

        const nextScene = state.scenes[currentIndex + 1];
        store.setState({ currentSceneId: nextScene.id });

        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Previous scene
     *
     * @returns Whether successful
     */
    previous(): APIResult<boolean> {
      try {
        const state = store.getState();

        if (!state.currentSceneId || state.scenes.length === 0) {
          return { success: false, error: "No current scene" };
        }

        const currentIndex = state.scenes.findIndex(
          (s) => s.id === state.currentSceneId,
        );
        if (currentIndex === -1 || currentIndex === 0) {
          return { success: false, error: "Already at first scene" };
        }

        const prevScene = state.scenes[currentIndex - 1];
        store.setState({ currentSceneId: prevScene.id });

        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Get the current scene
     *
     * @returns Current scene
     */
    current(): APIResult<Scene> {
      try {
        const state = store.getState();

        if (!state.currentSceneId) {
          return { success: false, error: "No current scene" };
        }

        const scene = getScene(state.scenes, state.currentSceneId);
        if (!scene) {
          return { success: false, error: "Current scene not found" };
        }

        return { success: true, data: scene };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  };

  // ==================== Element Operations (slide type only) ====================

  const element = {
    /**
     * Add an element to a Slide
     *
     * @param sceneId - Scene ID
     * @param element - Element parameters (must include type, left, top, width, height)
     * @returns Element ID
     */
    add(sceneId: string, element: CreateElementParams): APIResult<string> {
      try {
        const state = store.getState();
        const scene = getScene(state.scenes, sceneId);

        if (!scene) {
          return { success: false, error: `Scene not found: ${sceneId}` };
        }

        if (scene.type !== "slide") {
          return { success: false, error: `Scene is not a slide: ${sceneId}` };
        }

        const content = scene.content as SlideContent;
        const elementId = generateId(element.type);

        const newElement: PPTElement = {
          ...element,
          id: elementId,
          rotate: element.rotate ?? 0,
        } as PPTElement;

        const newScenes = state.scenes.map((s) => {
          if (s.id === sceneId) {
            return {
              ...s,
              content: {
                ...content,
                canvas: {
                  ...content.canvas,
                  elements: [...content.canvas.elements, newElement],
                },
              },
              updatedAt: Date.now(),
            };
          }
          return s;
        });

        store.setState({ scenes: newScenes });

        return { success: true, data: elementId };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Add elements in batch
     *
     * @deprecated will be removed in the future
     * @param sceneId - Scene ID
     * @param elements - Element array
     * @returns Element ID array
     */
    addBatch(
      sceneId: string,
      elements: CreateElementParams[],
    ): APIResult<string[]> {
      try {
        const state = store.getState();
        const scene = getScene(state.scenes, sceneId);

        if (!scene) {
          return { success: false, error: `Scene not found: ${sceneId}` };
        }

        if (scene.type !== "slide") {
          return { success: false, error: `Scene is not a slide: ${sceneId}` };
        }

        const content = scene.content as SlideContent;
        const elementIds: string[] = [];

        const newElements: PPTElement[] = elements.map((el) => {
          const elementId = generateId(el.type);
          elementIds.push(elementId);

          return {
            ...el,
            id: elementId,
            rotate: el.rotate ?? 0,
          } as PPTElement;
        });

        const newScenes = state.scenes.map((s) => {
          if (s.id === sceneId) {
            return {
              ...s,
              content: {
                ...content,
                canvas: {
                  ...content.canvas,
                  elements: [...content.canvas.elements, ...newElements],
                },
              },
              updatedAt: Date.now(),
            };
          }
          return s;
        });

        store.setState({ scenes: newScenes });

        return { success: true, data: elementIds };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Delete an element
     *
     * @param sceneId - Scene ID
     * @param elementId - Element ID
     * @returns Whether successful
     */
    delete(sceneId: string, elementId: string): APIResult<boolean> {
      try {
        const state = store.getState();
        const scene = getScene(state.scenes, sceneId);

        if (!scene) {
          return { success: false, error: `Scene not found: ${sceneId}` };
        }

        if (scene.type !== "slide") {
          return { success: false, error: `Scene is not a slide: ${sceneId}` };
        }

        const content = scene.content as SlideContent;

        const newScenes = state.scenes.map((s) => {
          if (s.id === sceneId) {
            return {
              ...s,
              content: {
                ...content,
                canvas: {
                  ...content.canvas,
                  elements: content.canvas.elements.filter(
                    (el) => el.id !== elementId,
                  ),
                },
              },
              updatedAt: Date.now(),
            };
          }
          return s;
        });

        store.setState({ scenes: newScenes });

        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Delete elements in batch
     *
     * @deprecated will be removed in the future
     * @param sceneId - Scene ID
     * @param elementIds - Element ID array
     * @returns Whether successful
     */
    deleteBatch(sceneId: string, elementIds: string[]): APIResult<boolean> {
      try {
        const state = store.getState();
        const scene = getScene(state.scenes, sceneId);

        if (!scene) {
          return { success: false, error: `Scene not found: ${sceneId}` };
        }

        if (scene.type !== "slide") {
          return { success: false, error: `Scene is not a slide: ${sceneId}` };
        }

        const content = scene.content as SlideContent;
        const elementIdSet = new Set(elementIds);

        const newScenes = state.scenes.map((s) => {
          if (s.id === sceneId) {
            return {
              ...s,
              content: {
                ...content,
                canvas: {
                  ...content.canvas,
                  elements: content.canvas.elements.filter(
                    (el) => !elementIdSet.has(el.id),
                  ),
                },
              },
              updatedAt: Date.now(),
            };
          }
          return s;
        });

        store.setState({ scenes: newScenes });

        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Update an element
     *
     * @param sceneId - Scene ID
     * @param elementId - Element ID
     * @param updates - Properties to update
     * @returns Whether successful
     */
    update(
      sceneId: string,
      elementId: string,
      updates: Partial<PPTElement>,
    ): APIResult<boolean> {
      try {
        const state = store.getState();
        const scene = getScene(state.scenes, sceneId);

        if (!scene) {
          return { success: false, error: `Scene not found: ${sceneId}` };
        }

        if (scene.type !== "slide") {
          return { success: false, error: `Scene is not a slide: ${sceneId}` };
        }

        const content = scene.content as SlideContent;

        const newScenes = state.scenes.map((s) => {
          if (s.id === sceneId) {
            return {
              ...s,
              content: {
                ...content,
                canvas: {
                  ...content.canvas,
                  elements: content.canvas.elements.map((el) =>
                    el.id === elementId ? { ...el, ...updates } : el,
                  ),
                },
              },
              updatedAt: Date.now(),
            };
          }
          return s;
        });

        store.setState({ scenes: newScenes });

        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Get an element
     *
     * @param sceneId - Scene ID
     * @param elementId - Element ID
     * @returns Element object
     */
    get(sceneId: string, elementId: string): APIResult<PPTElement> {
      try {
        const state = store.getState();
        const scene = getScene(state.scenes, sceneId);

        if (!scene) {
          return { success: false, error: `Scene not found: ${sceneId}` };
        }

        if (scene.type !== "slide") {
          return { success: false, error: `Scene is not a slide: ${sceneId}` };
        }

        const content = scene.content as SlideContent;
        const element = content.canvas.elements.find(
          (el) => el.id === elementId,
        );

        if (!element) {
          return { success: false, error: `Element not found: ${elementId}` };
        }

        return { success: true, data: element };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Get all elements of a scene
     *
     * @param sceneId - Scene ID
     * @returns Element list
     */
    list(sceneId: string): APIResult<PPTElement[]> {
      try {
        const state = store.getState();
        const scene = getScene(state.scenes, sceneId);

        if (!scene) {
          return { success: false, error: `Scene not found: ${sceneId}` };
        }

        if (scene.type !== "slide") {
          return { success: false, error: `Scene is not a slide: ${sceneId}` };
        }

        const content = scene.content as SlideContent;
        return { success: true, data: [...content.canvas.elements] };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Move an element (relative movement)
     *
     * @deprecated will be removed in the future
     * @param sceneId - Scene ID
     * @param elementId - Element ID
     * @param deltaX - X-axis movement distance
     * @param deltaY - Y-axis movement distance
     * @returns Whether successful
     */
    move(
      sceneId: string,
      elementId: string,
      deltaX: number,
      deltaY: number,
    ): APIResult<boolean> {
      try {
        const state = store.getState();
        const scene = getScene(state.scenes, sceneId);

        if (!scene) {
          return { success: false, error: `Scene not found: ${sceneId}` };
        }

        if (scene.type !== "slide") {
          return { success: false, error: `Scene is not a slide: ${sceneId}` };
        }

        const content = scene.content as SlideContent;

        const newScenes = state.scenes.map((s) => {
          if (s.id === sceneId) {
            return {
              ...s,
              content: {
                ...content,
                canvas: {
                  ...content.canvas,
                  elements: content.canvas.elements.map((el) => {
                    if (el.id === elementId) {
                      return {
                        ...el,
                        left: el.left + deltaX,
                        top: el.top + deltaY,
                      };
                    }
                    return el;
                  }),
                },
              },
              updatedAt: Date.now(),
            };
          }
          return s;
        });

        store.setState({ scenes: newScenes });

        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  };

  // ==================== Canvas Operations ====================

  const canvas = {
    /**
     * Set background
     *
     * @param sceneId - Scene ID
     * @param background - Background settings
     * @returns Whether successful
     */
    setBackground(
      sceneId: string,
      background: SlideBackground,
    ): APIResult<boolean> {
      try {
        const state = store.getState();
        const scene = getScene(state.scenes, sceneId);

        if (!scene || scene.type !== "slide") {
          return { success: false, error: "Invalid scene" };
        }

        const content = scene.content as SlideContent;

        const newScenes = state.scenes.map((s) => {
          if (s.id === sceneId) {
            return {
              ...s,
              content: {
                ...content,
                canvas: {
                  ...content.canvas,
                  background,
                },
              },
              updatedAt: Date.now(),
            };
          }
          return s;
        });

        store.setState({ scenes: newScenes });

        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Set theme
     *
     * @param sceneId - Scene ID
     * @param theme - Theme settings
     * @returns Whether successful
     */
    setTheme(sceneId: string, theme: Partial<SlideTheme>): APIResult<boolean> {
      try {
        const state = store.getState();
        const scene = getScene(state.scenes, sceneId);

        if (!scene || scene.type !== "slide") {
          return { success: false, error: "Invalid scene" };
        }

        const content = scene.content as SlideContent;

        const newScenes = state.scenes.map((s) => {
          if (s.id === sceneId) {
            return {
              ...s,
              content: {
                ...content,
                canvas: {
                  ...content.canvas,
                  theme: {
                    ...content.canvas.theme,
                    ...theme,
                  },
                },
              },
              updatedAt: Date.now(),
            };
          }
          return s;
        });

        store.setState({ scenes: newScenes });

        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Highlight an element (teaching feature)
     *
     * Emphasize an element by adding a highlight border or shadow
     *
     * @param sceneId - Scene ID
     * @param elementId - Element ID
     * @param options - Highlight options
     * @returns Whether successful
     */
    highlight(
      sceneId: string,
      elementId: string,
      options: HighlightOptions = {},
    ): APIResult<boolean> {
      const { duration, color = "#ff6b6b", style = "outline" } = options;

      try {
        // Use the new Canvas Store highlight overlay API
        // Advantage: does not modify the element itself, purely visual effect
        const canvasStore = useCanvasStore.getState();
        canvasStore.setHighlight([elementId], {
          color,
          opacity: style === "fill" ? 0.3 : 0.5,
          borderWidth: 3,
          animated: true,
        });

        // If duration is set, automatically clear the highlight
        if (duration) {
          setTimeout(() => {
            canvasStore.clearHighlight();
          }, duration);
        }

        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Spotlight effect (teaching feature)
     *
     * Highlight a specific element while dimming everything else
     * Note: this requires a mask layer in the frontend rendering layer
     *
     * @param sceneId - Scene ID
     * @param elementId - Element ID
     * @param options - Spotlight options
     * @returns Whether successful
     */
    spotlight(
      sceneId: string,
      elementId: string,
      options: SpotlightOptions = {},
    ): APIResult<boolean> {
      try {
        // Use Canvas Store's spotlight API
        const canvasStore = useCanvasStore.getState();
        canvasStore.setSpotlight(elementId, options);

        // If duration is set, automatically clear the spotlight
        if (options.duration) {
          setTimeout(() => {
            canvasStore.clearSpotlight();
          }, options.duration);
        }

        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Clear all highlight and spotlight effects
     *
     * @param sceneId - Scene ID
     * @returns Whether successful
     */
    clearHighlights(_sceneId: string): APIResult<boolean> {
      try {
        // Use Canvas Store to clear all teaching effects
        const canvasStore = useCanvasStore.getState();
        canvasStore.clearHighlight();
        canvasStore.clearSpotlight();

        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Clear spotlight effect
     *
     * @returns Whether successful
     */
    clearSpotlight(_sceneId?: string): APIResult<boolean> {
      try {
        const canvasStore = useCanvasStore.getState();
        canvasStore.clearSpotlight();
        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Set percentage-mode spotlight
     *
     * @param sceneId - Scene ID
     * @param elementId - Element ID
     * @param geometry - Percentage geometry info
     * @param options - Spotlight options
     * @returns Whether successful
     */
    setSpotlightPercentage(
      sceneId: string,
      elementId: string,
      geometry: import('@/lib/types/action').PercentageGeometry,
      options: SpotlightOptions = {},
    ): APIResult<boolean> {
      try {
        const canvasStore = useCanvasStore.getState();
        canvasStore.setSpotlightPercentage(elementId, geometry, options);

        if (options.duration) {
          setTimeout(() => {
            canvasStore.clearSpotlight();
          }, options.duration);
        }

        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Set laser pointer effect
     *
     * @param sceneId - Scene ID
     * @param elementId - Element ID
     * @param geometry - Percentage geometry info
     * @param options - Laser pointer options
     * @returns Whether successful
     */
    setLaser(
      sceneId: string,
      elementId: string,
      geometry: import('@/lib/types/action').PercentageGeometry,
      options: import('@/lib/store/canvas').LaserOptions = {},
    ): APIResult<boolean> {
      try {
        const canvasStore = useCanvasStore.getState();
        canvasStore.setLaser(elementId, options);

        if (options.duration) {
          setTimeout(() => {
            canvasStore.clearLaser();
          }, options.duration);
        }

        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Clear laser pointer effect
     *
     * @param sceneId - Scene ID
     * @returns Whether successful
     */
    clearLaser(_sceneId: string): APIResult<boolean> {
      try {
        const canvasStore = useCanvasStore.getState();
        canvasStore.clearLaser();
        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Set zoom effect
     *
     * @param sceneId - Scene ID
     * @param elementId - Element ID
     * @param geometry - Percentage geometry info
     * @param scale - Zoom scale
     * @returns Whether successful
     */
    setZoom(
      sceneId: string,
      elementId: string,
      geometry: import('@/lib/types/action').PercentageGeometry,
      scale: number,
    ): APIResult<boolean> {
      try {
        const canvasStore = useCanvasStore.getState();
        canvasStore.setZoom(elementId, scale);
        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Clear zoom effect
     *
     * @param sceneId - Scene ID
     * @returns Whether successful
     */
    clearZoom(_sceneId: string): APIResult<boolean> {
      try {
        const canvasStore = useCanvasStore.getState();
        canvasStore.clearZoom();
        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Clear all visual effects (spotlight, laser, zoom, etc.)
     *
     * @param sceneId - Scene ID
     * @returns Whether successful
     */
    clearAllEffects(_sceneId: string): APIResult<boolean> {
      try {
        const canvasStore = useCanvasStore.getState();
        canvasStore.clearAllEffects();
        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Highlight multiple elements in batch
     *
     * @param sceneId - Scene ID
     * @param elementIds - Element ID list
     * @param options - Highlight options
     * @returns Whether successful
     */
    highlightMultiple(
      sceneId: string,
      elementIds: string[],
      options: HighlightOptions = {},
    ): APIResult<boolean> {
      const { duration, color = "#ff6b6b" } = options;

      try {
        const canvasStore = useCanvasStore.getState();
        canvasStore.setHighlight(elementIds, {
          color,
          opacity: 0.3,
          borderWidth: 3,
          animated: true,
        });

        if (duration) {
          setTimeout(() => {
            canvasStore.clearHighlight();
          }, duration);
        }

        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  };

  // ==================== Whiteboard Management ====================

  const whiteboard = {
    /**
     * Create a whiteboard
     *
     * @returns Whether successful
     */
    create(): APIResult<Whiteboard> {
      try {
        const state = store.getState();
        const whiteboard: Whiteboard = {
          id: generateId('whiteboard'),
          viewportSize: 1000,
          viewportRatio: 16/9,
          elements: [],
          background: {
            type: 'solid',
            color: '#ffffff',
          },
          animations: [],
        };
        const whiteboardList = state.stage?.whiteboard ? [...state.stage.whiteboard, whiteboard] : [whiteboard];
        store.setState({ stage: { ...state.stage, whiteboard: whiteboardList } });
        return { success: true, data: whiteboard };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Get a whiteboard
     *
     * @returns The most recently created whiteboard object
     */
    get(): APIResult<Whiteboard> {
      try {
        const state = store.getState();
        if (!state.stage?.whiteboard || state.stage.whiteboard.length === 0) {
          return this.create();
        }
        return { success: true, data: state.stage.whiteboard.at(-1) };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Update a whiteboard
     *
     * @param updates - Fields to update
     * @param whiteboardId - Whiteboard ID
     * @returns Whether successful
     */
    update(updates: Partial<Whiteboard>, whiteboardId: string): APIResult<boolean> {
      try {
        const state = store.getState();
        const whiteboard = state.stage?.whiteboard?.find((wb) => wb.id === whiteboardId);
        if (!whiteboard) return { success: false, error: "Whiteboard not found" };
        const newWhiteboard = { ...whiteboard, ...updates };
        const whiteboardList = state.stage!.whiteboard!.map((wb) => wb.id === whiteboardId ? newWhiteboard : wb);
        store.setState({ stage: { ...state.stage, whiteboard: whiteboardList } });
        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Delete a whiteboard
     *
     * @param whiteboardId - Whiteboard ID
     * @returns Whether successful
     */
    delete(whiteboardId: string): APIResult<boolean> {
      try {
        const state = store.getState();
        const whiteboardList = state.stage!.whiteboard!.filter((wb) => wb.id !== whiteboardId);
        store.setState({ stage: { ...state.stage, whiteboard: whiteboardList } });
        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Get all whiteboards
     *
     * @returns List of all whiteboards
     */
    list(): APIResult<Whiteboard[]> {
      try {
        const state = store.getState();
        return { success: true, data: state.stage!.whiteboard! };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Get a whiteboard element
     *
     * @param elementId - Element ID
     * @param whiteboardId - Whiteboard ID
     * @returns Element object
     */
    getElement(elementId: string, whiteboardId: string): APIResult<PPTElement> {
      try {
        const state = store.getState();
        const whiteboard = state.stage!.whiteboard!.find((wb) => wb.id === whiteboardId);
        if (!whiteboard) return { success: false, error: "Whiteboard not found" };
        return { success: true, data: whiteboard.elements.find((el) => el.id === elementId) };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Add a whiteboard element
     *
     * @param element - Element object
     * @param whiteboardId - Whiteboard ID
     * @returns Whether successful
     */
    addElement(element: PPTElement, whiteboardId: string): APIResult<boolean> {
      try {
        const state = store.getState();
        const whiteboard = state.stage!.whiteboard!.find((wb) => wb.id === whiteboardId);
        if (!whiteboard) return { success: false, error: "Whiteboard not found" };
        const newElement = { ...element, id: element.id || generateId(element.type) };
        const newWhiteboard = { ...whiteboard, elements: [...whiteboard.elements, newElement] };
        const whiteboardList = state.stage!.whiteboard!.map((wb) => wb.id === whiteboardId ? newWhiteboard : wb);
        store.setState({ stage: { ...state.stage, whiteboard: whiteboardList } });
        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Delete a whiteboard element
     *
     * @param elementId - Element ID
     * @param whiteboardId - Whiteboard ID
     * @returns Whether successful
     */
    deleteElement(elementId: string, whiteboardId: string): APIResult<boolean> {
      try {
        const state = store.getState();
        const whiteboard = state.stage!.whiteboard!.find((wb) => wb.id === whiteboardId);
        if (!whiteboard) return { success: false, error: "Whiteboard not found" };
        const newWhiteboard = { ...whiteboard, elements: whiteboard.elements.filter((el) => el.id !== elementId) };
        const whiteboardList = state.stage!.whiteboard!.map((wb) => wb.id === whiteboardId ? newWhiteboard : wb);
        store.setState({ stage: { ...state.stage, whiteboard: whiteboardList } });
        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Update a whiteboard element
     *
     * @param element - Element object
     * @param whiteboardId - Whiteboard ID
     * @returns Whether successful
     */
    updateElement(element: PPTElement, whiteboardId: string): APIResult<boolean> {
      try {
        const state = store.getState();
        const whiteboard = state.stage!.whiteboard!.find((wb) => wb.id === whiteboardId);
        if (!whiteboard) return { success: false, error: "Whiteboard not found" };
        const newWhiteboard = { ...whiteboard, elements: whiteboard.elements.map((el) => el.id === element.id ? element : el) };
        const whiteboardList = state.stage!.whiteboard!.map((wb) => wb.id === whiteboardId ? newWhiteboard : wb);
        store.setState({ stage: { ...state.stage, whiteboard: whiteboardList } });
        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Get whiteboard element list
     *
     * @param whiteboardId - Whiteboard ID
     * @returns Element list
     */
    listElements(whiteboardId: string): APIResult<PPTElement[]> {
      try {
        const state = store.getState();
        const whiteboard = state.stage!.whiteboard!.find((wb) => wb.id === whiteboardId);
        if (!whiteboard) return { success: false, error: "Whiteboard not found" };
        return { success: true, data: whiteboard.elements };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  };

  // ==================== Mode Management ====================

  const mode = {
    /**
     * Set mode
     *
     * @param newMode - New mode
     */
    set(newMode: StageMode): APIResult<boolean> {
      try {
        store.setState({ mode: newMode });
        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Get current mode
     *
     * @returns Current mode
     */
    get(): APIResult<StageMode> {
      try {
        const state = store.getState();
        return { success: true, data: state.mode };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  };

  // ==================== Stage Management ====================

  const stage = {
    /**
     * Get Stage info
     *
     * @returns Stage object
     */
    get(): APIResult<Stage> {
      try {
        const state = store.getState();

        if (!state.stage) {
          return { success: false, error: "No stage" };
        }

        return { success: true, data: state.stage };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Update Stage info
     *
     * @param updates - Fields to update
     * @returns Whether successful
     */
    update(updates: Partial<Stage>): APIResult<boolean> {
      try {
        const state = store.getState();

        if (!state.stage) {
          return { success: false, error: "No stage" };
        }

        const newStage = {
          ...state.stage,
          ...updates,
          updatedAt: Date.now(),
        };

        store.setState({ stage: newStage });

        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  };

  // ==================== Return API Object ====================

  return {
    scene,
    navigation,
    element,
    canvas,
    whiteboard,
    mode,
    stage,
  };
}

// ==================== Type Exports ====================

export type StageAPI = ReturnType<typeof createStageAPI>;
