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

## Reference

### index.load()

Loads the index. Creates the index if it doesn't exist. Once loaded, the index
can be queried.

### index.close()

Closes the index and releases any opened file handle.

### index.query(params)

Queries any indexed fields. The keys in the *params* object are the indexes
names. Values are the indexed data to match.

It returns a promise to an EntryIterator object.

### EntryIterator

The entry iterator class represents a lazy result set. It reads the data file
only if items are required. It is a syncronous iterator, so any operation that
cause it to load data into memory is **blocking**. It implements ES6 iterator,
so it can be used with ```for ... of```. For instance:

```
index.query({
  field1: "value"
}).then(items => {
  for (var item of items) {
    console.log("Item id:", item.id);
  }
});
```

### EntryIterator#every(callback)

Same as Array.prototype.every.

### EntryIterator#filter(callback)

Same as Array.prototype.filter.

### EntryIterator#get(index)

Returns the specified item.

### EntryIterator#forEach(callback)

Same as Array.prototype.forEach.

### EntryIterator#length

Returns the number of items in the iterator.

### EntryIterator#map(callback)

Same as Array.prototype.map.

### EntryIterator#reduce(callback, initValue)

Same as Array.prototype.reduce.

### EntryIterator#slice(callback)

Same as Array.prototype.slice.

### EntryIterator#some(callback)

Same as Array.prototype.some.


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

Short answer: buffering. The index has a configurable memory buffer for parsing
and creating the index, and another buffer to read index entries. It reads the
data file from top to bottom loading data into the buffer asynchronously, and in
the meantime it processes the data reading a stream of json objects.

The parsing buffer size can be configured with the *parseBufferSize* option. As
data is loaded and processed in parallel, the memory usage always doubles the
*parseBufferSize* value.

The read index buffer keeps a range of data loaded into memory when a single
entry is required. Queries are lazy, the data file content is loaded into memory
only if an item is required, and only if the item does not exist in the buffer.
So, it is faster to traverse a collection if queries return items that are
placed consecutively in the data file.

Beyond the data buffers, it has a very small memory footprint. The index size in
memory is negligible. The V8 engine represents objects in very efficient
structures. I recommend to take a look at [this technical documentation about
Node and V8 architecture](https://github.com/thlorenz/v8-perf).

Regarding indexes, it creates a single index for each indexed field. Indexes are
stored in the file system as JSON files.