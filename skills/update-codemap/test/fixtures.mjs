// Per-language fixture corpus for the codemap language sweep.
//
// Each fixture is a minimal 2-module project shaped to exercise all three
// extraction targets at once:
//   - a `core/` module declaring a base type (interface/trait/abstract) + a field-bearing type
//   - an `app/` module declaring a derived type that EXTENDS/IMPLEMENTS the base and IMPORTS core
//
// The sweep asserts, per language, that the generated codemap contains:
//   (1) the derived class in `## Class graph` with the expected extends/implements edge   -> class extraction
//   (2) the field on the base type                                                        -> field extraction
//   (3) a cross-module file edge core <- app in `## File deps`                            -> import extraction
//   (4) a caller→callee call edge in `## Call graph`                        -> call-site extraction
//
// To exercise (4) each derived method calls a same-file free function `scale(...)`, so the
// expected edge is `<method> → scale` (intra-file, reliably resolved). `expect.calls = null`
// for languages with no statically determinable call site (mirrors `edgeTo: null`).
//
// `expect` declares what SHOULD appear if the language were fully supported. The sweep
// reports each as PASS / GAP so the matrix is honest about current coverage rather than
// only testing languages that already work.

export const FIXTURES = [
  {
    lang: 'typescript',
    files: {
      'core/shape.ts':
        `export interface Shape {\n  area(): number;\n}\n\n` +
        `export class Point {\n  public x: number = 0;\n  public y: number = 0;\n}\n`,
      'app/circle.ts':
        `import { Shape } from '../core/shape';\n\n` +
        `function scale(v: number): number { return 3.14 * v; }\n\n` +
        `export class Circle implements Shape {\n  public radius: number = 1;\n  area(): number { return scale(Math.max(this.radius, this.radius)); }\n}\n`,
    },
    // area() calls BOTH the project-defined `scale` and the builtin `Math.max`. The call-graph
    // precision pass must rank the project-internal `→ scale` edge ABOVE the builtin `→ max`
    // edge. `builtinCallee` drives the [precision] check.
    expect: { className: 'Circle', baseType: 'Shape', relation: 'implements', field: 'x', edgeFrom: 'app/circle.ts', edgeTo: 'core/shape.ts', calls: { caller: 'area', callee: 'scale' }, builtinCallee: 'max' },
  },

  {
    lang: 'csharp',
    files: {
      'core/Shape.cs':
        `namespace Geo.Core;\n\npublic interface IShape {\n  double Area();\n}\n\n` +
        `public class Point {\n  public double X;\n  public double Y;\n}\n`,
      'app/Circle.cs':
        `using Geo.Core;\n\nnamespace Geo.App;\n\n` +
        `public class Circle : IShape {\n  public double Radius;\n  private static double Scale(double v) { return 3.14 * v; }\n  public double Area() { return Scale(Radius * Radius); }\n}\n`,
    },
    expect: { className: 'Circle', baseType: 'IShape', relation: 'implements', field: 'X', edgeFrom: 'app/Circle.cs', edgeTo: 'core/Shape.cs', calls: { caller: 'Area', callee: 'Scale' } },
  },

  {
    lang: 'cpp',
    files: {
      'core/shape.h':
        `#pragma once\n\nclass Shape {\npublic:\n  virtual double area() const = 0;\n};\n\n` +
        `struct Point {\n  double x;\n  double y;\n};\n`,
      'app/circle.h':
        `#pragma once\n#include "core/shape.h"\n\n` +
        `class Circle : public Shape {\npublic:\n  double radius;\n  double area() const override;\n};\n`,
    },
    // The cpp fixture is header-only — methods are declarations without bodies, so there
    // is no call site to extract. calls: null records n/a (a cpp-impl `.cpp` would carry one).
    expect: { className: 'Circle', baseType: 'Shape', relation: 'extends', field: 'x', edgeFrom: 'app/circle.h', edgeTo: 'core/shape.h', calls: null },
  },

  {
    lang: 'python',
    files: {
      'core/shape.py':
        `class Shape:\n    def area(self):\n        raise NotImplementedError\n\n` +
        `class Point:\n    def __init__(self):\n        self.x = 0\n        self.y = 0\n`,
      'app/circle.py':
        `from core.shape import Shape\n\n` +
        `def scale(v):\n    return 3.14 * v\n\n` +
        `class Circle(Shape):\n    def __init__(self):\n        self.radius = 1\n    def area(self):\n        return scale(self.radius * self.radius)\n`,
    },
    expect: { className: 'Circle', baseType: 'Shape', relation: 'extends', field: 'x', edgeFrom: 'app/circle.py', edgeTo: 'core/shape.py', calls: { caller: 'area', callee: 'scale' } },
  },

  {
    lang: 'java',
    files: {
      'core/Shape.java':
        `package geo.core;\n\npublic interface Shape {\n  double area();\n}\n`,
      'core/Point.java':
        `package geo.core;\n\npublic class Point {\n  public double x;\n  public double y;\n}\n`,
      'app/Circle.java':
        `package geo.app;\n\nimport geo.core.Shape;\n\n` +
        `public class Circle implements Shape {\n  public double radius;\n  private double scale(double v) { return 3.14 * v; }\n  public double area() { return scale(radius * radius); }\n}\n`,
    },
    expect: { className: 'Circle', baseType: 'Shape', relation: 'implements', field: 'x', edgeFrom: 'app/Circle.java', edgeTo: 'core/Shape.java', calls: { caller: 'area', callee: 'scale' } },
  },

  {
    lang: 'kotlin',
    files: {
      'core/Shape.kt':
        `package geo.core\n\ninterface Shape {\n  fun area(): Double\n}\n\n` +
        `class Point {\n  var x: Double = 0.0\n  var y: Double = 0.0\n}\n`,
      'app/Circle.kt':
        `package geo.app\n\nimport geo.core.Shape\n\n` +
        `fun scale(v: Double): Double = 3.14 * v\n\n` +
        `class Circle : Shape {\n  var radius: Double = 1.0\n  override fun area(): Double = scale(radius * radius)\n}\n`,
    },
    expect: { className: 'Circle', baseType: 'Shape', relation: 'implements', field: 'x', edgeFrom: 'app/Circle.kt', edgeTo: 'core/Shape.kt', calls: { caller: 'area', callee: 'scale' } },
  },

  {
    lang: 'swift',
    files: {
      'core/Shape.swift':
        `public protocol Shape {\n  func area() -> Double\n}\n\n` +
        `public struct Point {\n  public var x: Double = 0\n  public var y: Double = 0\n}\n`,
      'app/Circle.swift':
        `import Foundation\n\n` +
        `func scale(_ v: Double) -> Double { return 3.14 * v }\n\n` +
        `public class Circle: Shape {\n  public var radius: Double = 1\n  public func area() -> Double { return scale(radius * radius) }\n}\n`,
    },
    // Swift has no file-level import syntax: same-module files reference each other with no
    // `import`. A cross-file edge is not statically determinable, so edgeTo is null (n/a).
    expect: { className: 'Circle', baseType: 'Shape', relation: 'implements', field: 'x', edgeFrom: 'app/Circle.swift', edgeTo: null, calls: { caller: 'area', callee: 'scale' } },
  },

  {
    lang: 'rust',
    files: {
      'core/shape.rs':
        `pub trait Shape {\n    fn area(&self) -> f64;\n}\n\n` +
        `pub struct Point {\n    pub x: f64,\n    pub y: f64,\n}\n`,
      'app/circle.rs':
        `use crate::core::shape::Shape;\n\n` +
        `fn scale(v: f64) -> f64 { 3.14 * v }\n\n` +
        `pub struct Circle {\n    pub radius: f64,\n}\n\n` +
        `impl Shape for Circle {\n    fn area(&self) -> f64 { scale(self.radius * self.radius) }\n}\n`,
    },
    expect: { className: 'Circle', baseType: 'Shape', relation: 'implements', field: 'x', edgeFrom: 'app/circle.rs', edgeTo: 'core/shape.rs', calls: { caller: 'area', callee: 'scale' } },
  },

  {
    lang: 'go',
    files: {
      'core/shape.go':
        `package core\n\ntype Shape interface {\n\tArea() float64\n}\n\n` +
        `type Point struct {\n\tX float64\n\tY float64\n}\n`,
      'app/circle.go':
        `package app\n\nimport "example.com/proj/core"\n\n` +
        `func scale(v float64) float64 { return 3.14 * v }\n\n` +
        `type Circle struct {\n\tcore.Point\n\tRadius float64\n}\n\n` +
        `func (c Circle) Area() float64 { return scale(c.Radius * c.Radius) }\n`,
    },
    expect: { className: 'Circle', baseType: 'Point', relation: 'implements', field: 'Radius', edgeFrom: 'app/circle.go', edgeTo: 'core/shape.go', calls: { caller: 'Area', callee: 'scale' } },
  },

  {
    lang: 'c',
    files: {
      'core/shape.c':
        `#pragma once\n\nstruct Shape {\n  double area;\n};\n\n` +
        `struct Point {\n  double x;\n  double y;\n};\n`,
      'app/circle.c':
        `#include "core/shape.c"\n\n` +
        `static double scale(double v) { return 3.14 * v; }\n\n` +
        `struct Circle {\n  struct Shape base;\n  double radius;\n};\n\n` +
        `double area(struct Circle* c) { return scale(c->radius * c->radius); }\n`,
    },
    // C has no inheritance/implements construct — baseType: null records [relation] as n/a
    // (not a gap). Composition (`struct Shape base`) is still captured as a field; the
    // declaration, import edge, and call edge are the real C coverage.
    expect: { className: 'Circle', baseType: null, relation: null, field: 'radius', edgeFrom: 'app/circle.c', edgeTo: 'core/shape.c', calls: { caller: 'area', callee: 'scale' } },
  },

  {
    lang: 'ruby',
    files: {
      'core/shape.rb':
        `class Shape\n  def initialize\n    @sides = 0\n  end\nend\n`,
      'app/circle.rb':
        `require_relative "../core/shape"\n\n` +
        `def scale(v)\n  3.14 * v\nend\n\n` +
        `class Circle < Shape\n  def initialize\n    @radius = 1\n  end\n  def area\n    scale(@radius * @radius)\n  end\nend\n`,
    },
    expect: { className: 'Circle', baseType: 'Shape', relation: 'extends', field: 'sides', edgeFrom: 'app/circle.rb', edgeTo: 'core/shape.rb', calls: { caller: 'area', callee: 'scale' } },
  },

  {
    lang: 'php',
    files: {
      'core/Shape.php':
        `<?php\nnamespace Geo\\Core;\n\ninterface IShape {\n  public function area(): float;\n}\n\n` +
        `class Point {\n  public float $x = 0;\n  public float $y = 0;\n}\n`,
      'app/Circle.php':
        `<?php\nnamespace Geo\\App;\n\nuse Geo\\Core\\IShape;\n\n` +
        `function scale(float $v): float { return 3.14 * $v; }\n\n` +
        `class Circle implements IShape {\n  public float $radius = 1;\n  public function area(): float { return scale($this->radius * $this->radius); }\n}\n`,
    },
    expect: { className: 'Circle', baseType: 'IShape', relation: 'implements', field: 'x', edgeFrom: 'app/Circle.php', edgeTo: 'core/Shape.php', calls: { caller: 'area', callee: 'scale' } },
  },
];
