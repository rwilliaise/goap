import { AgentGoal } from 'goal'

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
}
