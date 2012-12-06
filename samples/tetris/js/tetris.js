$.fn.safekeypress = function(func, cfg) {

    cfg = $.extend({
        stopKeys: {37:1, 38:1, 39:1, 40:1}
    }, cfg);

    function isStopKey(evt) {
        var isStop = (cfg.stopKeys[evt.keyCode] || (cfg.moreStopKeys && cfg.moreStopKeys[evt.keyCode]));
        if (isStop) evt.preventDefault();
        return isStop;
    }

    function getKey(evt) { return 'safekeypress.' + evt.keyCode; }

    function keypress(evt) {
        var key = getKey(evt),
            val = ($.data(this, key) || 0) + 1;
        $.data(this, key, val);
        if (val > 0) return func.call(this, evt);
        return isStopKey(evt);
    }

    function keydown(evt) {
        var key = getKey(evt);
        $.data(this, key, ($.data(this, key) || 0) - 1);
        return func.call(this, evt);
    }

    function keyup(evt) {
        $.data(this, getKey(evt), 0);
        return isStopKey(evt);
    }

    return $(this).keypress(keypress).keydown(keydown).keyup(keyup);
};


var getNiceShapes = function(shapeFactory, undefined) {
    /*
     * Things I need for this to work...
     *  - ability to test each shape with filled data
     *  - maybe give empty spots scores? and try to maximize the score?
     */

    var shapes = {},
        attr;

    for (attr in shapeFactory) {
        shapes[attr] = shapeFactory[attr]();
    }

    function scoreBlocks(possibles, blocks, x, y, filled, width, height) {
        var i, len=blocks.length, score=0, bottoms = {}, tx, ty, overlaps;

        // base score
        for (i=0; i<len; i+=2) {
            score += possibles[filled.asIndex(x + blocks[i], y + blocks[i+1])] || 0;
        }

        // overlap score -- //TODO - don't count overlaps if cleared?
        for (i=0; i<len; i+=2) {
            tx = blocks[i];
            ty = blocks[i+1];
            if (bottoms[tx] === undefined || bottoms[tx] < ty) {
                bottoms[tx] = ty;
            }
        }
        overlaps = 0;
        for (tx in bottoms) {
            tx = parseInt(tx);
            for (ty=bottoms[tx]+1, i=0; y+ty<height; ty++, i++) {
                if (!filled.check(x + tx, y + ty)) {
                    overlaps += i == 0 ? 2 : 1; //TODO-score better
                    //if (i == 0) overlaps += 1;
                    break;
                }
            }
        }

        score = score - overlaps;

        return score;
    }

    function resetShapes() {
        for (var attr in shapes) {
            shapes[attr].x = 0;
            shapes[attr].y = -1;
        }
    }

    //TODO -- evil mode needs to realize that overlap is bad...
    var func = function(filled, checkCollisions, width, height, mode) {
        resetShapes();

        var possibles = new Array(width * height),
            evil = mode == 'evil',
            x, y, py,
            attr, shape, i, blocks, bounds,
            score, best_shape, best_score = (evil ? 1 : -1) * 999, best_orientation, best_x,
            best_score_for_shape, best_orientation_for_shape, best_x_for_shape;

        for (x=0; x<width; x++) {
            for (y=0; y<=height; y++) {
                if (y == height || filled.check(x, y)) {
                    for (py=y-4; py<y; py++) {
                        possibles[filled.asIndex(x, py)] = py; //TODO - figure out better scoring?
                    }
                    break;
                }
            }
        }

        // for each shape...
        var opts = _one_shape === undefined ? shapes : {cur: _one_shape}; //BOO
        for (attr in opts) { //TODO - check in random order to prevent later shapes from winning
            shape = opts[attr];
            best_score_for_shape = -999;

            // for each orientation...
            for (i=0; i<(shape.symmetrical ? 2 : 4); i++) { //TODO - only look at unique orientations
                blocks = shape.getBlocks(i);
                bounds = shape.getBounds(blocks);

                // try each possible position...
                for (x=-bounds.left; x<width - bounds.width; x++) {
                    for (y=-1; y<height - bounds.bottom; y++) {
                        if (checkCollisions(x, y + 1, blocks, true)) {
                            // collision
                            score = scoreBlocks(possibles, blocks, x, y, filled, width, height);
                            if (score > best_score_for_shape) {
                                best_score_for_shape = score;
                                best_orientation_for_shape = i;
                                best_x_for_shape = x;
                            }
                            break;
                        }
                    }
                }
            }

            if ((evil && best_score_for_shape < best_score) ||
                (!evil && best_score_for_shape > best_score)) {
                best_shape = shape;
                best_score = best_score_for_shape;
                best_orientation = best_orientation_for_shape;
                best_x = best_x_for_shape;
            }
        }

        best_shape.best_orientation = best_orientation;
        best_shape.best_x = best_x;

        return best_shape;
    };

    func.no_preview = true;
    return func;
};


var undefined;
if (1) {
//(function(window, document, undefined) {

    var canvas = document.getElementById('game'),
        ctx = canvas.getContext('2d'),
        WIDTH = 10,
        HEIGHT = 20,
        PIXEL_WIDTH = $(canvas).width(),
        PIXEL_HEIGHT = $(canvas).height(),
        block_size = Math.ceil(PIXEL_WIDTH / WIDTH),
        bevel_size = Math.floor(block_size / 10),
        border_width = 2;

    function randInt(a, b) { return a + Math.floor(Math.random() * (1 + b - a)); }
    function randSign() { return randInt(0, 1) * 2 - 1; }
    function randChoice(choices) { return choices[randInt(0, choices.length-1)]; }

    function drawBlock(x, y, color, _ctx) {
        // convert x and y to pixel
        _ctx = _ctx || ctx;
        x = x * block_size;
        y = y * block_size;
        _ctx.fillStyle = color;
        _ctx.globalAlpha = .5;
        _ctx.fillRect(x, y, block_size, block_size);
        _ctx.globalAlpha = .5;
        _ctx.fillRect(x + bevel_size, y + bevel_size, block_size - 2*bevel_size, block_size - 2*bevel_size);
        _ctx.globalAlpha = 1;
    }

    function Shape(orienations, color, symmetrical) {

        $.extend(this, {
            x: 0,
            y: 0,
            symmetrical: symmetrical,
            init: function() {
                $.extend(this, {
                    orientation: 0,
                    x: Math.floor(WIDTH / 2) - 1,
                    y: -1
                });
                return this;
            },
            color: color,
            blocksLen: orienations[0].length,
            orientations: orienations,
            orientation: 0, // 4 possible
            rotate: function(right) {
                var orientation = (this.orientation + (right ? 1 : -1) + 4) % 4;

                //TODO - when past limit - auto shift and remember that too!
                if (!checkCollisions(this.x, this.y, this.getBlocks(orientation)))
                    this.orientation = orientation;
            },
            moveRight: function() {
                if (!checkCollisions(this.x + 1, this.y, this.getBlocks()))
                    this.x++;
            },
            moveLeft: function() {
                if (!checkCollisions(this.x - 1, this.y, this.getBlocks()))
                    this.x--;
            },
            getBlocks: function(orientation) { // optional param
                return this.orientations[orientation !== undefined ? orientation : this.orientation];
            },
            draw: function(drop, _x, _y, _orientation, _ctx) {
                if (drop) this.y++;

                var blocks = this.getBlocks(_orientation),
                    x = _x === undefined ? this.x : _x,
                    y = _y === undefined ? this.y : _y,
                    i = 0;
                console.log('(youngki) currblock', drop, blocks, x, y, _ctx);
                for (; i<this.blocksLen; i += 2) {
                    drawBlock(x + blocks[i], y + blocks[i+1], this.color, _ctx);
                }
            },
            getBounds: function(_blocks) { // _blocks can be an array of blocks, an orientation index, or undefined
                var blocks = $.isArray(_blocks) ? _blocks : this.getBlocks(_blocks),
                    i=0, len=blocks.length, minx=999, maxx=-999, miny=999, maxy=-999;
                for (; i<len; i+=2) {
                    if (blocks[i] < minx) minx = blocks[i];
                    if (blocks[i] > maxx) maxx = blocks[i];
                    if (blocks[i+1] < miny) miny = blocks[i+1];
                    if (blocks[i+1] > maxy) maxy = blocks[i+1];
                }
                return {
                    left: minx,
                    right: maxx,
                    top: miny,
                    bottom: maxy,
                    width: maxx - minx,
                    height: maxy - miny
                };
            }
        });

        return this.init();
    };

    var shapeFactory = {
        line: function() {
            /*
             *   X        X
             *   O  XOXX  O XOXX
             *   X        X
             *   X        X
             */
            var ver = [0, -1, 0, -2, 0, -3, 0, -4],
            hor = [-1, -2, 0, -2, 1, -2, 2, -2];
            return new Shape([ver, hor, ver, hor], '#f90', true);
        },
        square: function() {
            /*
             *  XX
             *  XX
             */
            var s = [0, 0, 1, 0, 0, -1, 1, -1];
            return new Shape([s, s, s, s], 'red', true);
        },
        arrow: function() {
            /*
             *    X   X       X
             *   XOX  OX XOX XO
             *        X   X   X
             */
            return new Shape([
                [0, -1, 1, -1, 2, -1, 1, -2],
                [1, -2, 1, -1, 1, 0, 2, -1],
                [0, -1, 1, -1, 2, -1, 1, 0],
                [0, -1, 1, -1, 1, -2, 1, 0]
            ], 'yellow');
        },
        rightHook: function() {
            /*
             *       XX   X X
             *   XOX  O XOX O
             *   X    X     XX
             */
            return new Shape([
                [0, 0, 0, -1, 1, -1, 2, -1],
                [0, -2, 1, 0, 1, -1, 1, -2],
                [0, -1, 1, -1, 2, -1, 2, -2],
                [0, -2, 0, -1, 0, 0, 1, 0]
            ], 'blue');
        },
        leftHook: function() {
            /*
             *        X X   XX
             *   XOX  O XOX O
             *     X XX     X
             */
            return new Shape([
                [2, 0, 0, -1, 1, -1, 2, -1],
                [0, 0, 1, 0, 1, -1, 1, -2],
                [0, -2, 0, -1, 1, -1, 2, -1],
                [0, 0, 0, -1, 0, -2, 1, -2]
            ], 'purple');
        },
        leftZag: function() {
            /*
             *        X
             *   XO  OX
             *    XX X
             */
            var ver = [0, 0, 0, -1, 1, -1, 1, -2],
                hor = [0, -1, 1, -1, 1, 0, 2, 0];
            return new Shape([hor, ver, hor, ver], 'gray', true);
        },
        rightZag: function() {
            /*
             *       X
             *    OX OX
             *   XX   X
             */
            var ver = [0, -2, 0, -1, 1, -1, 1, 0],
                hor = [0, 0, 1, 0, 1, -1, 2, -1];
            return new Shape([hor, ver, hor, ver], 'green', true);
        }

    };

    var shapeFuncs = [];
    $.each(shapeFactory, function(k,v) { shapeFuncs.push(v); });

    var filled = {
        data: new Array(WIDTH * HEIGHT),
        toClear: {},
        check: function(x, y) {
            return this.data[this.asIndex(x, y)];
        },
        add: function(x, y, color) {
            if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT)
                this.data[this.asIndex(x, y)] = color;
        },
        asIndex: function(x, y) {
            return x + y*WIDTH;
        },
        asX: function(index) {
            return index % WIDTH;
        },
        asY: function(index) {
            return Math.floor(index / WIDTH);
        },
        _popRow: function(row_to_pop) {
            for (var i=WIDTH*(row_to_pop+1) - 1; i>=0; i--) {
                this.data[i] = (i >= WIDTH ? this.data[i-WIDTH] : undefined);
            }
        },
        checkForClears: function() {
            var rows = [], i, len, count, mod;

            for (i=0, len=this.data.length; i<len; i++) {
                mod = this.asX(i);
                if (mod == 0) count = 0;
                if (this.data[i] && typeof this.data[i] == 'string') {
                    count += 1;
                }
                if (mod == WIDTH - 1 && count == WIDTH) rows.push(this.asY(i));
            }

            for (i=0, len=rows.length; i<len; i++) {
                this._popRow(rows[i]);
                board.lines++;
                if (board.lines % 10 == 0 && board.dropDelay > 1) board.dropDelay -= 2;
            }
        },
        draw: function() {
            //console.log('(youngki) board', this.data);
            for (var i=0, len=this.data.length, row, color; i<len; i++) {
                if (this.data[i] !== undefined) {
                    row = this.asY(i);
                    color = this.data[i];
                    drawBlock(this.asX(i), row, color);
                }
            }
        }
    };

    function checkCollisions(x, y, blocks, checkDownOnly) {
        // x & y should be aspirational values
        var i = 0, len = blocks.length, a, b;
        for (; i<len; i += 2) {
            a = x + blocks[i];
            b = y + blocks[i+1];

            if (b >= HEIGHT || filled.check(a, b)) {
                return true;
            } else if (!checkDownOnly && a < 0 || a >= WIDTH) {
                return true;
            }
        }
        return false;
    }

    var niceShapes = getNiceShapes(shapeFactory);

    var board = {
        animateDelay: 50,
        cur: null,

        lines: 0,

        dropCount: 0,
        dropDelay: 24, //5,

        init: function() {
            this.cur = this.nextShape();

            ctx.font = 'bold 30px/40px "lucida grande",helvetica,arial';
            ctx.fillStyle = '#333';
            ctx.fillText(' Click', 50, 120);
            ctx.fillText('to start', 50, 160);

            var start = [], colors = [], i, ilen, j, jlen, color;

            for (i in shapeFactory) {
                colors.push(shapeFactory[i]().color);
            }

            for (i=0, ilen=WIDTH; i<ilen; i++) {
                for (j=0, jlen=randChoice([randInt(0, 8), randInt(5, 9)]); j<jlen; j++) {
                    if (!color || !randInt(0, 3)) color = randChoice(colors);
                    start.push([i, HEIGHT - j, color]);
                }
            }

            for (i=0, ilen=start.length; i<ilen; i++)
                drawBlock.apply(drawBlock, start[i]);
        },
        nextShape: function(_set_next_only) {
            var next = this.next,
                func, shape, result;

            func = randChoice(shapeFuncs);

            if (func.no_preview) {
                this.next = null;
                if (_set_next_only) return null;
                shape = func(filled, checkCollisions, WIDTH, HEIGHT);
                if (!shape) throw new Error('No shape returned from shape function!', func);
                shape.init();
                result = shape;
            } else {
                shape = func(filled, checkCollisions, WIDTH, HEIGHT);
                if (!shape) throw new Error('No shape returned from shape function!', func);
                shape.init();
                this.next = shape;
                if (_set_next_only) return null;
                result = next || this.nextShape();
            }

            if (window.autopilot) { //fun little hack...
                niceShapes(filled, checkCollisions, WIDTH, HEIGHT, 'nice', result);
                $.extend(result, {
                    orientation: result.best_orientation,
                    x: result.best_x
                });
            }

            return result;
        },
        animate: function() {
            var drop = false,
                gameOver = false;

            if (!this.paused) {
                this.dropCount++;
                if (this.dropCount >= this.dropDelay || window.autopilot) {
                    drop = true;
                    this.dropCount = 0;
                }

                // test for a collision
                if (drop) {
                    var cur = this.cur, x = cur.x, y = cur.y, blocks = cur.getBlocks();
                    if (checkCollisions(x, y+1, blocks, true)) {
                        drop = false;
                        for (var i=0; i<cur.blocksLen; i+=2) {
                            filled.add(x + blocks[i], y + blocks[i+1], cur.color);
                            if (y + blocks[i] < 0) {
                                gameOver = true;
                            }
                        }
                        filled.checkForClears();
                        this.cur = this.nextShape();
                    }
                }

                // draw it!
                ctx.clearRect(0, 0, PIXEL_WIDTH, PIXEL_HEIGHT);
                filled.draw();
                this.cur.draw(drop);
            }

            if (!gameOver)
                window.setTimeout(function() { board.animate(); }, this.animateDelay);
        }
    };

    //
    //
    //

    board.init();

    function startBoard(evt) {
        evt.preventDefault();
        board.started = true;
        board.animate();
        return false;
    }

    $(document).keyup(function(evt) {
        return (!board.started && (evt.keyCode == 13 || evt.keyCode == 32)) ? startBoard(evt) : true;
    });

    $(canvas).click(function(evt) {
        return (!board.started) ? startBoard(evt) : true;
    });

    $(document).keyup(function(evt) {
        if (evt.keyCode == 80) { /*p*/
            board.paused = !board.paused;
        } else if (evt.keyCode == 192) { /*`*/
            window.autopilot = !window.autopilot;
        }
    });

    $(document).safekeypress(function(evt) {
        var caught = false;
        if (board.cur) {
            caught = true;
            switch(evt.keyCode) {
              case 37: /*left*/ board.cur.moveLeft(); break;
              case 38: /*up*/ board.cur.rotate(true); break;
              case 39: /*right*/ board.cur.moveRight(); break;
              case 40: /*down*/ board.dropCount = board.dropDelay; break;
              case 88: /*x*/ board.cur.rotate(true); break;
              case 90: /*z*/ board.cur.rotate(false); break;
            default: caught = false;
            }
        }
        if (caught) evt.preventDefault();
        return !caught;
    });

}
//})(this, this.document);
