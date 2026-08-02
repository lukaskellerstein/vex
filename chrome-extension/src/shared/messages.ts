import type { Action, InteractionMode } from "./types";

// Content Script -> Background
export interface CaptureTabRequest {
  action: "captureTab";
}

export interface CaptureTabSuccessResponse {
  dataUrl: string;
}

export interface CaptureTabErrorResponse {
  error: string;
}

export type CaptureTabResponse = CaptureTabSuccessResponse | CaptureTabErrorResponse;

// Popup -> Content Script
export interface PingRequest {
  action: "ping";
}

export interface PingResponse {
  pong: true;
}

export interface GetStateRequest {
  action: "getState";
}

export interface GetStateResponse {
  mode: InteractionMode;
  actions: Action[];
  isActive: boolean;
  pageUrl: string;
  pageTitle: string;
}

export interface ToggleActiveRequest {
  action: "toggleActive";
  active: boolean;
}

export interface ToggleActiveResponse {
  isActive: boolean;
}

export interface SetModeRequest {
  action: "setMode";
  mode: InteractionMode;
}

export interface SetModeResponse {
  mode: InteractionMode;
}

export interface RemoveActionRequest {
  action: "removeAction";
  index: number;
}

export interface RemoveActionResponse {
  removed: true;
}

export interface UpdateInstructionRequest {
  action: "updateInstruction";
  index: number;
  instruction: string;
}

export interface UpdateInstructionResponse {
  updated: true;
}

export interface ClearActionsRequest {
  action: "clearActions";
}

export interface ClearActionsResponse {
  cleared: true;
}

export interface SendBatchRequest {
  action: "sendBatch";
}

export interface SendBatchResponse {
  batchId: string;
  status: string;
}

export type ContentMessage =
  | PingRequest
  | GetStateRequest
  | ToggleActiveRequest
  | SetModeRequest
  | RemoveActionRequest
  | UpdateInstructionRequest
  | ClearActionsRequest
  | SendBatchRequest;

// AgentManager connection
export const AGENT_MANAGER_URL = "http://localhost:8420";
export const NATS_WS_URL = "ws://localhost:4223";
