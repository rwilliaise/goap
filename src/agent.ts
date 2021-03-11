import { AgentAction } from 'action'
import { AgentGoal } from 'goal'

export type DataSet = Map<string, boolean>

enum RunningThread {
  NONE,
  TREE_UPDATE,
  PLAN_UPDATE
}

enum RunningState {
  MOVING,
  ACTION
}

export class Agent {
  runningThread: RunningThread = RunningThread.NONE
  runningState: RunningState = RunningState.ACTION // idle, by default

  goals: Map<string, AgentGoal> = new Map()

  constructor(public gameObject: Model) {}

  removeAction(action: AgentAction) {}
}
