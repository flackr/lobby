.PHONY: all

all: lobby/util.js lobby/client.js lobby/host.js lobby/sha1.js lobby/lobby.js lobby/lobby.css lobby/eye.svg lobby/locked.svg lobby/people.svg lobby/stopwatch.svg

lobby/%.svg: ../../lobby/%.svg
	mkdir -p lobby
	cp $^ $@

lobby/util.js: ../../client/util.js
	mkdir -p lobby
	cp $^ $@

lobby/client.js: ../../client/client.js
	mkdir -p lobby
	cp $^ $@

lobby/host.js: ../../server/host.js
	mkdir -p lobby
	cp $^ $@

lobby/sha1.js: ../../server/sha1.js
	mkdir -p lobby
	cp $^ $@

lobby/lobby.js: ../../lobby/lobby.js
	mkdir -p lobby
	cp $^ $@

lobby/lobby.css: ../../lobby/lobby.css
	mkdir -p lobby
	cp $^ $@
