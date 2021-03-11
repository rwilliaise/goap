import Thread from '@rbxts/thread'
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
  /** The type of the currently running thread */
  runningThread: RunningThread = RunningThread.NONE
  /** The current state of the agent */
  runningState: RunningState = RunningState.ACTION // idle, by default

  /** Contains all current goals */
  goals: Map<string, AgentGoal> = new Map()
  /** Contains all possible actions */
  possibleActions: AgentAction[] = []
  /** Contains all actions that needs to be removed */
  removeActions: AgentAction[] = []
  /** Contains all actions that need to be added */
  addActions: AgentAction[] = []
  /** Contains the current plan, a stack of actions to be executed */
  activeActions: AgentAction[] = []

  /**
   * Can contain an action that needs to be performed before everything else
   * when it's conditions are true
   */
  interveneAction?: AgentAction
  /**
   * Can contain an action that needs to be performed when all other actions
   * fail
   */
  idleAction?: AgentAction

  /** Reference to the current dataset */
  dataSet: DataSet = new Map()
  /** Holds past actions that have been executed */
  actionHistory: AgentAction[] = []

  transformName?: string

  constructor(public gameObject: Model) {
    this.awake()
    this.start()
  }

  getActiveAction() {
    return this.activeActions.size() > 0
      ? this.activeActions[0]
      : this.idleAction
  }

  isActiveActionInRange() {
    // AAAAAAAAAAAAAA
    return (
      this.gameObject!.PrimaryPart!.Position.sub(
        this.getActiveAction()!.target!.Position!
      ).Magnitude < this.getActiveAction()!.requiredRange!
    )
  }

  /**
   * Override this function to add actions, goals, and other things.
   */
  awake() {}

  /**
   * Should be called every Heartbeat. By default this is not bound to Heartbeat;
   * you will need to implement that yourself.
   */
  update() {}

  start() {
    this.transformName = this.gameObject.Name
  }

  checkThread() {
    if (this.runningThread === RunningThread.NONE) {
      if (this._addActions() || this._removeActions()) {
        this.startUpdatingTrees()
      } else {
        this.startRunning()
      }
    }
  }

  startRunning() {
    this.runningThread = RunningThread.PLAN_UPDATE
    const goals: AgentGoal[] = []
    this.goals.forEach((value) => goals.push(value))
    Thread.Spawn(() => this.runThreaded(goals))
  }

  startUpdatingTrees() {
    this.runningThread = RunningThread.TREE_UPDATE
    Thread.Spawn(() => this.updateTrees())
  }

  runThreaded(goals: AgentGoal[]) {}

  run(goals: AgentGoal[]) {
    // const actions: AgentAction[] = []
    // const totalActions: AgentAction[] = []
    // let cheapest = math.huge
    // let totalCheapest = 0
  }

  updateTrees() {
    for (const [, goal] of this.goals) {
      this.createTree(goal)
    }

    this.runningThread = RunningThread.NONE
  }

  createTree(goal: AgentGoal) {}

  addAction(action: AgentAction) {
    this.addActions.push(action)
  }

  removeAction(action: AgentAction) {
    this.removeActions.push(action)
  }

  _removeActions(): boolean {
    let changed = false
    for (const removedAction of this.removeActions) {
      changed ||= this.possibleActions.some((action, index) => {
        if (removedAction.id === action.id) {
          this.possibleActions.remove(index)
          return true
        }
        return false
      })
    }

    this.removeActions.clear()
    return changed
  }

  _addActions(): boolean {
    let changed = false
    for (const action of this.addActions) {
      if (!this.possibleActions.some((value) => value.id === action.id)) {
        this.possibleActions.push(action)
        changed = true
      }
    }
    this.addActions.clear()
    return changed
  }
}
