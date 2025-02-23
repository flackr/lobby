export default class PriorityQueue<T> {
  #compare: (a: T, b: T) => boolean;
  #heap: T[];

  constructor(comparator = (a: T, b: T) => a < b) {
    this.#compare = comparator;
    this.#heap = [];
  }

  size(): number {
    return this.#heap.length;
  }

  isEmpty(): boolean {
    return this.size() == 0;
  }

  push(value: T): void {
    this.#heap.push(value);
    this.#siftUp();
  }

  peek(): T | undefined {
    return this.#heap[0];
  }

  pop(): T | undefined {
    this.#swap(0, this.size() - 1);
    const value = this.#heap.pop();
    this.#siftDown();
    return value;
  }

  #swap(i: number, j: number): void {
    [this.#heap[i], this.#heap[j]] = [this.#heap[j], this.#heap[i]];
  }

  #siftUp(): void {
    let current = this.size() - 1;
    while (current > 0) {
      const parent = ((current + 1) >> 1) - 1;
      if (!this.#compare(this.#heap[current], this.#heap[parent])) break;
      this.#swap(current, parent);
      current = parent;
    }
  }

  #siftDown(): void {
    let current = 0;
    while (true) {
      const children = (current << 1) + 1;
      if (children >= this.size()) break;
      // If we have a left child, assume it is the max child.
      let minChild = children;
      // Check if the right child exists and sorts before the left.
      if (
        minChild + 1 < this.size() &&
        this.#compare(this.#heap[minChild + 1], this.#heap[minChild])
      )
        ++minChild;
      if (!this.#compare(this.#heap[minChild], this.#heap[current])) break;
      this.#swap(current, minChild);
      current = minChild;
    }
  }
}
