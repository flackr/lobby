export default class MockLocalStorage {
  constructor(storage) {
    this._storage = storage || {};
  }
  getItem(key) {
    return this._storage[key];
  }
  setItem(key, value) {
    this._storage[key] = value;
  }
  removeItem(key) {
    delete this._storage[key];
  }
}