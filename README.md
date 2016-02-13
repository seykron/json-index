# json-index

Very simple and fast index for large JSON files.

It reads a collection of objects from a JSON file and creates indexes for
properties. Once the index is ready, it allows to query the index by properties
and it lazily reads the original file when an entry is required.

IMPORTANT: it doesn't support to filter objects, it assumes the file is a JSON
with a plain collection of objects, and it only indexes the first-level objects.

## Installation

Install from npm. It requires Node >= 4.

```
npm install json-index --save
```

## Usage

```
const DATA_FILE = "data/large.json";
const INDEX_DIR = "data/index/";

var index = require("json-index")(DATA_FILE, INDEX_DIR, {
  indexes: ["field1", "field2", "field3"],
  readBufferSize: 1024 * 1024 * 2.5,
  parseBufferSize: 1024 * 1024 * 512
});

index.load().then(() => {
  index.query({
    field1: "value"
  }).then(items => {
    console.log("Total matches: ", items.length);
    index.close();
  }).catch(err => console.log("Error creating/reading index:", err));
});
```

## Theory and performance

Disk read is slow. It is not possible to scale reading from the file system. I
recommend you to take a look at this [great
article](http://www.drdobbs.com/parallel/multithreaded-file-io/220300055) in
order to realize that disk IO cannot be improved by software, even trying multi-
threading. The only scenario in which it is possible to take advantage of
parallel IO is when there's data processing while another thread is reading from
disk.

On my rough benchmarks, the average read speed of my laptop is 49.2 MB/s. You
can try guessing your read speed writing and reading by using dd command:

This command creates a 1.6GB file and reports the average write speed:

``
$ dd if=/dev/zero of=speedtest bs=64k count=25600 conv=fdatasync
25600+0 records in
25600+0 records out
1677721600 bytes (1.7 GB) copied, 20.6269 s, 81.3 MB/s
``

This command copies the previous file to a new one and reports the average
read speed:

``
$ dd if=speedtest of=copytest bs=64k conv=fdatasync
25600+0 records in
25600+0 records out
1677721600 bytes (1.7 GB) copied, 34.7155 s, 48.3 MB/s
``

The average read speed is 48.3 MB/s, it means any application running on user
space cannot go beyond this rate. It is the same with this index. Once created,
queries are fast, but traversing a large resultset will cause buffered reads.

## How it works

TODO