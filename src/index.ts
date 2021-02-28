import { HttpService, PathfindingService } from '@rbxts/services'

export enum ActionState {
  WAITING,
  DOING,
  DONE
}

interface Node {
  parent?: Node
  runningCost: number
  runningState: WorldState
  currentAction?: Action
}

type WorldState = Map<string, unknown>
type FiniteState = (actor: Actor) => void

class StateMachine {
  public stack: FiniteState[] = []
  public actor: Actor

  public constructor(actor: Actor) {
    this.actor = actor
  }

  update() {
    const func = this.stack[this.stack.size() - 1]
    func(this.actor)
  }

  push(func: FiniteState) {
    this.stack.push(func)
  }

  pop() {
    this.stack.pop()
  }
}

/**
 * Used by the planner to set a concrete goal that the AI should go after.
 */
export abstract class Goal {
  /**
   * Checks if a goal should be pursued.
   *
   * @param state State that the Goal should check against.
   * @param actor Actor that the Goal should check against.
   */
  abstract isValid(state: WorldState, actor: Actor): boolean

  /**
   * Checks if a state reaches the given goal.
   *
   * @param state State that the Goal should check.
   * @param actor Actor that the Goal should check.
   */
  abstract reachedGoal(state: WorldState, actor: Actor): boolean

  /**
   * Used to bias the planner towards some goals instead of others. The weight
   * of a given Goal is procedurally produced, based on the current state. This
   * allows the planner to plan more dynamically than if it were a fixed cost.
   *
   * @param state Given state that the Goal should assess.
   */
  abstract getWeight(state: WorldState, actor: Actor): number
}

/**
 * Actions are used alongside other Actions to reach a given goal.
 */
export abstract class Action {
  private preconditions: WorldState = new Map()

  /**
   * Checks whether or not the current world state is valid for this given
   * action.
   *
   * @param state State that the Action should check against.
   * @param actor Actor that the Action should check against.
   */
  isValid(state: WorldState, actor: Actor) {
    for (const [index, value] of this.preconditions) {
      let match = false
      for (const [otherIndex, otherValue] of state) {
        if (otherIndex === index && otherValue === value) {
          match = true
        }
      }
      if (!match) {
        // HAS to meet ALL preconditions, or fails
        return false
      }
    }
    return this.checkProceduralPreconditions(actor)
  }

  /**
   * Invoked after all constant preconditions are checked. This flags whether
   * or not the state a given actor is in is good for this given action.
   *
   * @param actor Actor to check against.
   */
  checkProceduralPreconditions(actor: Actor) {
    return true
  }

  /**
   * Sets a given state to be a precondition.
   *
   * @param index Index of given value in the WorldState
   * @param value Value to be put as a condition.
   */
  addPrecondition(index: string, value: unknown) {
    this.preconditions.set(index, value)
  }

  /**
   * Used to get how the given Action will affect the state.
   *
   * @param state State that the Action should mutate.
   * @param actor Actor that the Action should use to mutate the state.
   */
  abstract populate(state: WorldState, actor: Actor): WorldState

  /**
   * Perform the given action.
   *
   * @param actor Actor to perform the action on.
   */
  abstract perform(actor: Actor): boolean

  /**
   * Get the cost of a given state.
   */
  abstract getCost(): number

  /**
   * Used to assess when the Action is done performing.
   */
  abstract getState(): ActionState

  /**
   * Clean up variables and other things within the Action.
   */
  reset() {
    // nothing to clean up!
  }
}

/**
 * Action that requires the Actor to be at a given target position.
 */
export abstract class MovingAction extends Action {
  public target?: Vector3
  public inRange = false

  checkProceduralPreconditions(actor: Actor) {
    const foundTarget = this.findTarget(actor)
    if (foundTarget) {
      this.target = foundTarget
      return true
    }
    return false
  }

  reset() {
    this.target = undefined
    this.inRange = false
  }

  /**
   * Tries to find a viable target, and returns the position.
   *
   * @param state State to get target from
   */
  abstract findTarget(actor: Actor): Vector3 | undefined
}

export class Planner {
  // AI goals and possible actions
  private goals: Goal[] = []
  private actions: Action[] = []

  private actor: Actor

  public constructor(actor: Actor) {
    this.actor = actor
  }

  /**
   * Creates a new plan for the AI to follow.
   */
  plan(state: WorldState): Action[] {
    this.actions.forEach((value) => {
      value.reset()
    })

    // goals that arent valid at the start of planning probably wont be valid at the end of planning
    // this may be a fallacy but i dont really care LMAO
    const pursuableGoals = this.goals.mapFiltered((value) => {
      return value.isValid(state, this.actor) ? value : undefined
    })
    this.actor.debug(pursuableGoals)

    // build the graph, and see if it found a solution
    const [success, leaves] = this.build(this.actions, pursuableGoals, {
      runningCost: 0,
      runningState: state
    }) as LuaTuple<[boolean, Node[]]> // typing nonsense, but works :shrug:

    if (!success) {
      this.actor.debug('Failed to generate graph!')
      // no way to meet any goals, oh well
      return []
    }

    let cheapestLeaf: Node | undefined = undefined
    for (const node of leaves) {
      if (!cheapestLeaf) {
        cheapestLeaf = node
        continue
      }
      if (node.runningCost < cheapestLeaf!.runningCost) {
        cheapestLeaf = node
      }
    }

    const out: Action[] = []
    let node = cheapestLeaf

    while (node !== undefined) {
      if (node.currentAction) {
        out.insert(0, node.currentAction)
      }
      node = node.parent
    }

    return out
  }

  /**
   * Build an Action graph, with one path being the cheapest.
   *
   * @param actions An array of possible actions that the AI could take.
   */
  private build(
    actions: Action[],
    goals: Goal[],
    parent: Node,
    leaves?: Node[]
  ): boolean | LuaTuple<[boolean, Node[]]> {
    const flag = leaves === undefined
    leaves = leaves || []

    let found = false

    // loop through all possible actions, testing to see if this given action will meet any goal.
    for (const action of actions) {
      if (action.isValid(parent!.runningState, this.actor)) {
        // okay! this action can be done
        const currentState = action.populate(parent!.runningState, this.actor)
        const node = {
          parent: parent,
          runningCost: parent.runningCost + action.getCost(),
          runningState: currentState,
          currentAction: action
        }

        // meets ANY goal
        // TODO: allow weighted goals, some are preferred over others
        let goalScore = 0
        goals.forEach((value) => {
          goalScore += value.reachedGoal(currentState, this.actor)
            ? value.getWeight(currentState, this.actor)
            : 0
        })

        this.actor.debug('goalScore: ', goalScore, 'action:', action)
        this.actor.debug('currentState: ', currentState)

        // if it meets literally ANY goal, we are good to go
        // possibly could subtract goal weight from runningCost
        if (goalScore > 0) {
          this.actor.debug('Wow! It works!')
          node.runningCost -= goalScore
          leaves.push(node)
          found = true
        } else {
          const subset = actions.mapFiltered((value) => {
            return action !== value ? value : undefined
          })
          found = found || (this.build(subset, goals, node, leaves) as boolean)
        }
      }
    }

    if (flag) {
      return ([found, leaves] as unknown) as LuaTuple<[boolean, Node[]]>
    }
    return found
  }

  addAction(action: Action) {
    this.actions.push(action)
  }

  addGoal(goal: Goal) {
    this.goals.push(goal)
  }
}

/**
 * A humanoid that can plan and do those plans accordingly.
 */
export abstract class Actor {
  public character: Instance = this.createCharacter()
  public humanoid: Humanoid = this.character.WaitForChild(
    'Humanoid'
  ) as Humanoid

  protected stack: StateMachine = new StateMachine(this)
  protected planner: Planner = new Planner(this)
  protected currentPlan: Action[] | undefined
  protected moving = false

  private debugMode = false
  private uniqueId = HttpService.GenerateGUID()

  protected constructor() {
    this.stack.push(this.idle)
  }

  /**
   * Idle state for the FSM
   * @param actor Actor to perform the FiniteState on
   */
  idle = (actor: Actor) => {
    const plan = actor.planner.plan(actor.getState())

    if (plan) {
      actor.currentPlan = plan

      actor.stack.pop()
      actor.stack.push(actor.perform)
      this.debug('Found a plan!')
    } else {
      actor.stack.pop()
      actor.stack.push(actor.idle)
      this.debug('Failed plan!')
    }
  }

  /**
   * Perform action state for the FSM
   * @param actor Actor to perform the FiniteState on
   */
  perform = (actor: Actor) => {
    if (actor.currentPlan?.size() === 0) {
      this.debug('Empty plan!')
      actor.stack.pop()
      actor.stack.push(actor.idle)
      return
    }

    let action = actor.currentPlan![actor.currentPlan!.size() - 1]

    if (action.getState() === ActionState.DOING) {
      // dont do anything and wait
      return
    }

    if (action.getState() === ActionState.DONE) {
      this.debug('Finished action!')
      actor.currentPlan?.pop()
    }

    if (actor.currentPlan!.size() > 0) {
      action = actor.currentPlan![actor.currentPlan!.size() - 1]

      const inRange = action instanceof MovingAction ? action.inRange : true

      if (inRange) {
        this.debug('Performing action!')
        const success = action.perform(actor)

        if (!success) {
          actor.stack.pop()
          actor.stack.push(actor.idle)
        }
      } else {
        actor.stack.push(actor.moveTo)
      }
    } else {
      this.debug('Finished plan!')
      actor.stack.pop()
      actor.stack.push(actor.idle)
    }
  }

  /**
   * MoveTo state for the FSM
   * @param actor Actor to perform the FiniteState on
   */
  moveTo = (actor: Actor) => {
    if (actor.moving) {
      // since we are already moving, everything is assessed, and thus good to go.
      return
    }

    const action = actor.currentPlan![
      actor.currentPlan!.size() - 1
    ] as MovingAction

    // technically, this shouldn't be possible without major error from the dev
    if (action instanceof MovingAction && action.target === undefined) {
      // no target to go to, just pop move and perform actions
      actor.stack.pop()
      actor.stack.pop()
      actor.stack.push(actor.idle)
      return
    }

    actor.moving = true

    actor.move(action.target!).then(() => {
      action.inRange = true
      actor.moving = false
      actor.stack.pop()
    })
  }

  /**
   * Runs the AI, including the current FSM state.
   */
  async update() {
    this.stack.update()
  }

  addAction(action: Action) {
    this.planner.addAction(action)
  }

  addGoal(goal: Goal) {
    this.planner.addGoal(goal)
  }

  /**
   * Create a path object with agent params. By default, it does not have any
   * params.
   */
  createPath() {
    return PathfindingService.CreatePath()
  }

  /**
   * Make the character path to a specific point.
   *
   * @param target Position to move to
   */
  move(target: Vector3) {
    return new Promise<void>((resolve, reject, onCancel) => {
      let cancelled = false
      let promise: Promise<void> | undefined = undefined
      onCancel(() => {
        cancelled = true
      })
      const path = this.createPath()
      path.ComputeAsync(
        (this.character as Model).GetPrimaryPartCFrame().Position,
        target
      )
      if (path.Status !== Enum.PathStatus.Success) {
        reject()
        return
      }

      let blocked = false

      const connection = path.Blocked.Connect((waypointNum: number) => {
        blocked = true
        promise = this.move(target)
        connection.Disconnect()
      })

      for (const waypoint of path.GetWaypoints()) {
        if (cancelled) {
          break
        }
        if (blocked) {
          promise!.await()
          resolve()
          return
        }
        if (waypoint.Action === Enum.PathWaypointAction.Jump) {
          this.humanoid.Jump = true
        }
        this.humanoid.MoveTo(waypoint.Position)
        this.humanoid.MoveToFinished.Wait()
      }

      connection.Disconnect()
      resolve()
    })
  }

  debug(...args: unknown[]) {
    if (!this.debugMode) {
      return
    }
    print('[' + this.uniqueId + ']', ...args)
  }

  /**
   * Forces the Actor to debug everything.
   */
  forceDebug() {
    this.debugMode = true
  }

  /**
   * Used internally to create the character. Returned instance requires a
   * Humanoid to be present, or the Actor will stall waiting for it.
   */
  abstract createCharacter(): Instance

  /**
   * Creates a WorldState with variables outside of the Actor.
   */
  abstract getState(): WorldState
}
