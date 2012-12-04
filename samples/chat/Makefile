.PHONY: all

all: lobby/util.js lobby/client.js lobby/host.js


lobby/util.js: ../../client/util.js
	mkdir -p lobby
	cp $^ $@

lobby/client.js: ../../client/client.js
	mkdir -p lobby
	cp $^ $@

lobby/host.js: ../../server/host.js
	mkdir -p lobby
	cp $^ $@
