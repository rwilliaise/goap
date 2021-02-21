interface Node {
	parent?: Node;
	runningCost: number;
	runningState: any;
	currentAction?: Action;
}

type WorldState = Map<string, unknown>;
type FiniteState = (actor: Actor) => void;

class StateMachine {

	public stack: FiniteState[] = [];
	public actor: Actor;

	public constructor(actor: Actor) {
		this.actor = actor;
	}

	update() {
		let func = this.stack[this.stack.size()];
		func(this.actor);
	}

	push(func: FiniteState) {
		this.stack.push(func);
	}

	pop() {
		this.stack.pop();
	}
}

export abstract class Goal {

	/**
	 * Checks if a goal should be pursued.
	 * 
	 * @param state State that the Goal should check against.
	 */
	abstract isValid(state: any): boolean;

	/**
	 * Checks if a state reaches the given goal.
	 * 
	 * @param state State that the Goal should check.
	 */
	abstract reachedGoal(state: any): boolean;

	abstract getWeight(state: any): number;
}

export abstract class Action {

	public preconditions: WorldState = new Map();

	/**
	 * Checks whether or not the current world state is valid for this given
	 * action.
	 * 
	 * @param state State that the Action should check against.
	 */
	isValid(state: WorldState) {
		for (let [index, value] of this.preconditions) {
			let match = false;
			for (let [otherIndex, otherValue] of state) {
				if (otherIndex === index && otherValue === value) {
					match = true;
				}
			}
			if (!match) { // HAS to meet ALL preconditions, or fails
				return false;
			}
		}
		return this.checkProceduralPreconditions(state);
	}

	checkProceduralPreconditions(state: WorldState) {
		return true;
	}

	addPrecondition(index: string, value: any) {
		this.preconditions.set(index, value);
	}

	/**
	 * Used to get how the given Action will affect the state.
	 * 
	 * @param state State that the Action should mutate.
	 */
	abstract populate(state: WorldState): any;

	/**
	 * Perform the given action.
	 */
	abstract perform(actor: Actor): boolean;

	/**
	 * Get the cost of a given state.
	 */
	abstract getCost(): number;

	/**
	 * Clean up variables and other things within the Action.
	 */
	reset() {
		// nothing to clean up!
	}
}

export abstract class Actor {

	// AI goals and possible actions
	private goals: Goal[] = [];
	private actions: Action[] = [];

	private character: Instance;
	private humanoid: Humanoid;

	private stack: StateMachine;
	private currentPlan: Action[] | undefined;

	public constructor() {
		this.character = this.createCharacter(); // TODO: allow squad behaviour actors, possibly seperate planner and actor
		this.humanoid = this.character.WaitForChild("Humanoid") as Humanoid;
		
		this.stack = new StateMachine(this);
		this.stack.push(this.idle);
	}

	idle = (actor: Actor) => {
		let plan = actor.plan();

		// if (plan) {

		// }
	}

	perform = (actor: Actor) => {

	}

	moveTo = (actor: Actor) => {

	}

	/**
	 * Runs the AI, including the current FSM state.
	 */
	update() {
		this.stack.update();
	}

	/**
	 * Creates a new plan for the AI to follow.
	 */
	private plan() {
		this.actions.forEach(value => {
			value.reset();
		});

		let state = this.getState();
		let pursuableGoals = this.goals.mapFiltered(value => {
			return value.isValid(state) ? value : undefined;
		});

		let graph = this.build(this.actions, pursuableGoals);
	}
	
	/**
	 * Build an Action graph, with one path being the cheapest.
	 * 
	 * @param actions An array of possible actions that the AI could take.
	 */
	private build(actions: Action[], goals: Goal[], parent?: Node, leaves?: Node[]) {
		parent = parent || { runningCost: 0, runningState: this.getState() }
		leaves = leaves || [];

		let found = false;

		for (let action of actions) {
			if (action.isValid(parent!.runningState)) {
				let currentState = action.populate(parent!.runningState);
				let node = { parent: parent, runningCost: parent?.runningCost! + action.getCost(), runningState: currentState, currentAction: action }
				let bestGoal = undefined;

				for (let goal of goals) {
					if (!bestGoal && goal.reachedGoal(currentState)) {
						bestGoal = goal;
						continue;
					}
					if (goal.reachedGoal(currentState) && bestGoal!.getWeight(currentState) < goal.getWeight(currentState)) {
						bestGoal = goal
					}
				}

				if (bestGoal) {
					leaves.push(node);
				}
			}
		}
	}

	/**
	 * Used internally to create the character. Returned instance requires a
	 * Humanoid to be present, or the Actor will stall waiting for it.
	 */
	abstract createCharacter(): Instance;

	abstract getState(): WorldState;
}