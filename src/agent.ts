import Thread from '@rbxts/thread'
import { AgentAction } from 'action'
import { AgentGoal } from 'goal'

/** Used for the current world state */
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

  /** Get the currently running action */
  getActiveAction() {
    return this.activeActions.size() > 0
      ? this.activeActions[0]
      : this.idleAction
  }

  /** Check if the current action is in range */
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
   *
   * @param delta The time, in seconds, from the last run
   */
  fixedUpdate(delta: number) {
    if (this.runInterveneAction()) {
      return
    }

    this.checkThread()
    this.runAction(delta)
  }

  /** Ran after awake; do not extend. */
  start() {
    this.transformName = this.gameObject.Name

    this.startUpdatingTrees()
  }

  /** Checks the state of the threads, starts new threads as needed */
  checkThread() {
    if (this.runningThread === RunningThread.NONE) {
      if (this._addActions() || this._removeActions()) {
        this.startUpdatingTrees()
      } else {
        this.startRunning()
      }
    }
  }

  /** Start the execution thread */
  startRunning() {
    this.runningThread = RunningThread.PLAN_UPDATE
    Thread.Spawn(() => this.runThreaded())
  }

  /** Start the planning thread */
  startUpdatingTrees() {
    this.runningThread = RunningThread.TREE_UPDATE
    Thread.Spawn(() => this.updateTrees())
  }

  /** Checks if the agent can run the intervene action, and does so if possible */
  runInterveneAction(): boolean {
    if (this.interveneAction !== undefined) {
      this.interveneAction.update(this.dataSet)

      if (this.interveneAction.preconditionsValid) {
        this.runningState = RunningState.ACTION
        this.interveneAction.perform()
        return true
      }
    }
    return false
  }

  /** Runs the current active action, with a given delta. */
  runAction(delta: number) {
    if (this.getActiveAction() !== undefined) {
      this.getActiveAction()?.run(delta)

      if (
        this.getActiveAction()?.target !== undefined &&
        this.isActiveActionInRange()
      ) {
        this.runningState = RunningState.ACTION
        this.getActiveAction()?.perform()
      } else {
        this.runningState = RunningState.MOVING
        this.move(this.getActiveAction()!)
      }
    }
  }

  /** Starts executing the plan in a seperate coroutine. */
  runThreaded() {
    const newActions = this.run()
    Thread.Spawn(() => this.onRunComplete(newActions))
  }

  /** Get the cheapest branch out of the actions */
  run() {
    let totalActions: AgentAction[] | undefined = []
    let actions: AgentAction[] = []
    let cheapest = math.huge
    let totalCheapest = 0

    for (const [, goal] of this.goals) {
      ;[totalCheapest, totalActions] = goal.getTotalCost(totalActions)
      if (totalActions !== undefined && totalCheapest < cheapest) {
        cheapest = totalCheapest
        actions = totalActions
      }
    }

    return actions
  }

  /** After the cheapest branch has been found, start executing the branch. */
  onRunComplete(newActions: AgentAction[]) {
    const delay = newActions.size() > 0 ? newActions[0].delay : 0.05

    Thread.Wait(delay)

    const oldAction =
      this.activeActions.size() > 0 ? this.activeActions[0] : undefined
    this.updateActions()
    this.activeActions = newActions

    if (this.activeActions.size() > 0 && oldAction !== this.activeActions[0]) {
      if (oldAction !== undefined) {
        oldAction.onStop()
      }
      this.activeActions[0].onStart()
      this.actionHistory.push(this.activeActions[0])

      if (this.actionHistory.size() > 10) {
        this.actionHistory.remove(0)
      }
    }

    this.runningThread = RunningThread.NONE
  }

  /** Create the trees for each goal */
  updateTrees() {
    for (const [, goal] of this.goals) {
      this.createTree(goal)
    }

    this.runningThread = RunningThread.NONE
  }

  /** Update all the actions and the goals based on the dataset */
  updateActions() {
    for (const [, goal] of this.goals) {
      goal.update(this.dataSet)
    }
  }

  /** Create a tree and branches for a goal. */
  createTree(goal: AgentGoal) {
    const actions = this.getMatchingGoalChildren(goal)
    goal.children = actions
  }

  /** Get all actions that fit as a child to the input action */
  getMatchingActionChildren(parent: AgentAction) {
    const matches: AgentAction[] = []

    for (const [condition] of parent.preconditions) {
      for (const action of this.possibleActions) {
        if (getmetatable(action) === getmetatable(parent)) {
          continue
        }

        for (const [effect] of action.effects) {
          if (
            condition === effect &&
            parent.preconditions.get(condition) === action.effects.get(effect)
          ) {
            const tAction = action.clone()
            tAction.children = this.getMatchingActionChildren(tAction)
            matches.push(tAction)
          }
        }
      }
    }

    return matches
  }

  /** Return a list of all actions that share the same goal */
  getMatchingGoalChildren(parent: AgentGoal) {
    const matches: AgentAction[] = []

    for (const action of this.possibleActions) {
      if (action.goal === parent.key) {
        const tAction = action.clone()
        tAction.children = this.getMatchingActionChildren(tAction)
        matches.push(tAction)
      }
    }

    return matches
  }

  /** Marks an action to be added to the tree. Actions are added next frame */
  addAction(action: AgentAction) {
    this.addActions.push(action)
  }

  /** Marks an action to be removed from the tree, after the next frame. */
  removeAction(action: AgentAction) {
    this.removeActions.push(action)
  }

  /**
   * Remove actions that were marked for deletion.
   * @internal
   * @returns Whether or not the tree was edited.
   */
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

  /**
   * Adds actions that were marked for addition.
   * @internal
   * @returns Whether or not the tree was edited.
   */
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

  move(action: AgentAction) {}
}
