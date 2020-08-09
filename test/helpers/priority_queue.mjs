export default class PriorityQueue {
  constructor(comparator = (a, b) => a < b) {
    this._heap = [];
    this._compare = comparator;
  }

  size() {
    return this._heap.length;
  }

  isEmpty() {
    return this.size() == 0;
  }

  push(value) {
    this._heap.push(value);
    this._siftUp();
  }

  peek() {
    return this._heap[0];
  }

  pop() {
    const value = this._heap[0];
    this._swap(0, this.size() - 1);
    this._heap.pop();
    this._siftDown();
    return value;
  }

  _swap(i, j) {
    [this._heap[i], this._heap[j]] = [this._heap[j], this._heap[i]];
  }

  _siftUp() {
    let current = this.size() - 1;
    while (current > 0) {
      const parent = ((current + 1) >> 1) - 1;
      if (!this._compare(this._heap[current], this._heap[parent]))
        break;
      this._swap(current, parent);
      current = parent;
    }
  }

  _siftDown() {
    let current = 0;
    while (true) {
      const children = (current << 1) + 1;
      if (children >= this.size())
        break;
      // If we have a left child, assume it is the max child.
      let minChild = children;
      // Check if the right child exists and sorts before the left.
      if (minChild + 1 < this.size() && this._compare(this._heap[minChild + 1], this._heap[minChild]))
        ++minChild;
      if (!this._compare(this._heap[minChild], this._heap[current]))
        break;
      this._swap(current, minChild);
      current = minChild;
    }
  }
}