import { Workspace } from '@rbxts/services'
import Thread from '@rbxts/thread'
import { Agent, DataSet } from 'agent'

let global_id = 0

export abstract class AgentAction {
  /**
   * Global id of this action. Used to see if one action was cloned from another.
   */
  id: number = global_id++

  /** The key of the goal that this action completes. */
  goal?: string

  /** The target of this action */
  target?: BasePart
  /** The children of this action. Used for planning */
  children: AgentAction[] = []
  /** Last position agent was in, cached */
  agentPosition: Vector3 = new Vector3()
  /** Should this action get removed when no target has been found? */
  removeWhenTargetless = false

  /** Current position of this action */
  position: Vector3 = new Vector3()

  /** Cached check for preconditions */
  preconditionsValid = false
  /** Cached check for procedural preconditions */
  proceduralConditionsValid = false

  /** The preconditions for this action to be executed. */
  preconditions: Map<string, boolean> = new Map()
  /** The effects of this action. */
  effects: Map<string, boolean> = new Map()

  /**
   * The distance between this action's target and the next action's target
   * will be multiplied by this.
   */
  distanceMultiplier = 1

  /** Cached distance to the action before. */
  distance = 0

  /** Cached cheapest branch of children */
  cheapestChilds?: AgentAction[]
  /** Cached cheapest branch of children's cost. */
  cheapestCost = 0

  /** Equal to the amount of time that this action has been running for. */
  currentRunTime = 0
  /** Max amount of time this action can run for before stopping. */
  maxRunTime = 3

  /** Determines if the action is currently running. */
  isRunning = false
  /** Determines if the action is blocked from running. */
  isBlocked = false

  /**
   * The minimum distance to the target to execute. When out of range, the AI
   * will try to move to the target. */
  abstract requiredRange: number
  /** The fixed cost of executing this action. */
  abstract cost: number
  /** The (unique) name of the target object. */
  targetString = ''

  // ROBLOX SPECIFIC STUFF
  /** The instance or array to search for a target */
  targetSpace: Instance | PVInstance[] = Workspace
  /** Determines whether or not the search for the target should be recursive */
  targetRecurse = true

  constructor(
    /** This action's agent. */
    public agent: Agent,
    /**
     * Delay this action goes through, in seconds, before execution. Recommended
     * to be from 0.1-0.3 */
    public delay = 0.1
  ) {}

  /** Get the amount of child 'layers' that are children for this action */
  getDepth() {
    if (this.children.size() > 0) {
      let deepest = 0

      for (const child of this.children) {
        const childDepth = child.getDepth()
        if (childDepth > deepest) {
          deepest = childDepth
        }
      }

      return deepest + 1
    } else {
      return 0
    }
  }

  /**
   * Get the total cost of the cheapest branch of this action and it's tree.
   * Outputs a list containing the cheapest actions to perform this action
   *
   * @param cheapestObject
   * Since references are not available in TS, I have to resort to an object.
   * Please supply an empty object. Please.
   */
  getTotalCost(cheapest: AgentAction[]): number {
    cheapest.clear()
    this.cheapestCost = math.huge
    let totalCost = 0

    if (this.proceduralConditionsValid && !this.preconditionsValid) {
      const totalActions: AgentAction[] = []

      for (const child of this.children) {
        if (!child.proceduralConditionsValid) {
          continue
        }

        child.distance = this.distanceToChild(child)
        totalCost = child.distance + child.getTotalCost(totalActions)

        if (totalCost < this.cheapestCost) {
          if (totalActions !== undefined) {
            totalActions.forEach((value) => cheapest.push(value))
            cheapest.push(this)
          } else {
            cheapest.clear()
          }
          this.cheapestCost = totalCost
        }
      }
    }

    // no more valid child actions
    if (cheapest.size() === 0) {
      // we have found the winning action!
      if (this.proceduralConditionsValid && this.preconditionsValid) {
        cheapest.clear()
        cheapest.push(this)

        this.cheapestChilds = cheapest
        return this.cost + this.agentPosition.sub(this.position).Magnitude
      } else {
        this.cheapestChilds = cheapest
        return math.huge
      }
    }

    return this.cost + this.cheapestCost
  }

  /** Get the distance from `child` to this action. */
  distanceToChild(child: AgentAction) {
    return child.position.sub(this.position).Magnitude
  }

  /** Get the cached distance multiplied by the multiplier. */
  getDistance() {
    return this.distance * this.distanceMultiplier
  }

  /** Block the action from executing for a given timeout. */
  async blockAction(timeout = 1) {
    this.isBlocked = true
    Thread.Wait(timeout)
    this.isBlocked = false
  }

  /** Fired when the action starts running. */
  onStart() {
    this.isRunning = true
  }

  /** Fired when the action finishes running. */
  onStop() {
    this.isRunning = false
    this.currentRunTime = 0
  }

  /** Called every Update() that this action is active */
  run(deltaTime: number) {
    if (this.isRunning) {
      this.currentRunTime += deltaTime

      if (this.currentRunTime >= this.maxRunTime && !this.isBlocked) {
        this.blockAction()
      }
    }
  }

  /** Sets the id of the action to a given `id`. */
  setClone(id: number): this {
    this.id = id
    return this
  }

  /** Find a viable target for this action to pursue. */
  findTarget() {
    if (typeOf(this.targetSpace) === 'Instance') {
      const out = (this.targetSpace as Instance).FindFirstChild(
        this.targetString,
        this.targetRecurse
      )
      if (out?.IsA('BasePart')) {
        return out
      }
    } else {
      const arr = this.targetSpace as BasePart[]
      if (this.targetRecurse) {
        return this.recursivelyFindTarget(arr)
      }
      for (const inst of arr) {
        if (inst.Name === this.targetString) {
          return inst
        }
      }
    }
  }

  /** Internal function to find a target recursively through a given array. */
  recursivelyFindTarget(targets: BasePart[]): BasePart | undefined {
    for (const inst of targets) {
      if (inst.Name === this.targetString) {
        return inst
      }
      return this.recursivelyFindTarget(inst.GetChildren() as BasePart[])
    }
  }

  /** Updates the current target variable. */
  updateTarget() {
    if (this.targetString === '') {
      this.targetString = this.agent.gameObject.Name
    }
    if (this.target === undefined) {
      this.target = this.findTarget()
    }
    if (this.removeWhenTargetless && this.target === undefined) {
      this.agent.removeAction(this)
    }
  }

  /** Updates the positions of relevant objects */
  updatePosition() {
    if (this.agent !== undefined) {
      if (this.agent.gameObject.PrimaryPart === undefined) {
        warn('!! WARNING !! PrimaryPart missing! The AI will inevitably break!')
      }
      this.agentPosition =
        this.agent.gameObject.PrimaryPart?.Position || this.agentPosition // eugh
    }
    if (this.target !== undefined) {
      this.position = this.target.Position
    }
  }

  /** Check if all preconditions are true */
  checkPreconditions(data: DataSet) {
    for (const [key] of this.preconditions) {
      if (data.get(key) !== this.preconditions.get(key)) {
        return false
      }
    }
    return true
  }

  /** Checks the procedural conditions of this action */
  checkProceduralPreconditions(data: DataSet) {
    return this.target !== undefined && !this.isBlocked
  }

  /** Updates this action, caches all the data */
  update(data: DataSet) {
    this.updateTarget()
    this.updatePosition()

    this.preconditionsValid = this.checkPreconditions(data)
    this.proceduralConditionsValid = this.checkProceduralPreconditions(data)

    for (const child of this.children) {
      child.update(data)
    }
  }

  abstract perform(): void

  /**
   * Needs to be called to clone this object, should be implemented in each clone
   */
  abstract clone(): AgentAction
}
