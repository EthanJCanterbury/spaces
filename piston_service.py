
"""
Piston Service - Handles code execution for multiple languages using the Piston API
"""

import requests
import json
import logging
from typing import Dict, List, Optional, Any, Union

logger = logging.getLogger(__name__)

PISTON_API_BASE = "https://emkc.org/api/v2/piston"
RUNTIMES_ENDPOINT = f"{PISTON_API_BASE}/runtimes"
EXECUTE_ENDPOINT = f"{PISTON_API_BASE}/execute"

# Default execution limits
DEFAULT_COMPILE_TIMEOUT = 10000  # 10 seconds in milliseconds
DEFAULT_RUN_TIMEOUT = 3000  # 3 seconds in milliseconds
DEFAULT_MEMORY_LIMIT = -1  # No limit

class PistonService:
    """Service for executing code using the Piston API."""
    
    _runtimes_cache = None
    _runtimes_by_language = None
    
    @classmethod
    def get_runtimes(cls, force_refresh=False) -> List[Dict[str, Any]]:
        """Get available runtimes from Piston API with caching."""
        if cls._runtimes_cache is None or force_refresh:
            try:
                response = requests.get(RUNTIMES_ENDPOINT)
                response.raise_for_status()
                cls._runtimes_cache = response.json()
                
                # Create a lookup by language
                cls._runtimes_by_language = {}
                for runtime in cls._runtimes_cache:
                    lang = runtime['language']
                    if lang not in cls._runtimes_by_language:
                        cls._runtimes_by_language[lang] = []
                    cls._runtimes_by_language[lang].append(runtime)
                
            except Exception as e:
                logger.error(f"Error fetching Piston runtimes: {str(e)}")
                return []
        
        return cls._runtimes_cache
    
    @classmethod
    def get_languages(cls) -> List[str]:
        """Get a list of available programming languages."""
        cls.get_runtimes()  # Ensure cache is populated
        if cls._runtimes_by_language:
            # Filter out inappropriate language names
            excluded_languages = ["brainfuck"]
            filtered_languages = [lang for lang in cls._runtimes_by_language.keys() 
                                if lang.lower() not in excluded_languages]
            return sorted(filtered_languages)
        return []
    
    @classmethod
    def get_language_versions(cls, language: str) -> List[str]:
        """Get available versions for a specific language."""
        cls.get_runtimes()  # Ensure cache is populated
        if cls._runtimes_by_language and language in cls._runtimes_by_language:
            return [runtime['version'] for runtime in cls._runtimes_by_language[language]]
        return []
    
    @classmethod
    def get_latest_version(cls, language: str) -> Optional[str]:
        """Get the latest version for a specific language."""
        versions = cls.get_language_versions(language)
        return versions[0] if versions else None
    
    @classmethod
    def execute_code(cls, 
                     language: str, 
                     code: str, 
                     version: Optional[str] = None,
                     stdin: str = "",
                     args: List[str] = None) -> Dict[str, Any]:
        """
        Execute code using the Piston API.
        
        Args:
            language: Programming language to use
            code: Source code to execute
            version: Specific version to use (optional, uses latest if not specified)
            stdin: Standard input to provide to the program
            args: Command line arguments to pass to the program
            
        Returns:
            Dictionary containing execution results
        """
        if args is None:
            args = []
            
        # Get the latest version if not specified
        if not version:
            version = cls.get_latest_version(language)
            if not version:
                return {
                    "success": False,
                    "error": f"Language '{language}' not supported or no version available"
                }
        
        # Prepare the request payload
        extension = cls._get_file_extension(language)
        payload = {
            "language": language,
            "version": version,
            "files": [
                {
                    "name": f"main.{extension}",
                    "content": code
                }
            ],
            "stdin": stdin,
            "args": args,
            "compile_timeout": DEFAULT_COMPILE_TIMEOUT,
            "run_timeout": DEFAULT_RUN_TIMEOUT,
            "compile_memory_limit": DEFAULT_MEMORY_LIMIT,
            "run_memory_limit": DEFAULT_MEMORY_LIMIT
        }
        
        try:
            response = requests.post(EXECUTE_ENDPOINT, json=payload)
            response.raise_for_status()
            result = response.json()
            
            # Format the response for our application
            output = {
                "success": True,
                "language": language,
                "version": version,
                "output": "",
                "error": None,
                "execution_time": 0
            }
            
            # Extract run output
            if "run" in result:
                run_data = result["run"]
                output["output"] = run_data.get("stdout", "")
                
                # Add stderr if present
                if run_data.get("stderr"):
                    if output["output"]:
                        output["output"] += "\n"
                    output["output"] += run_data["stderr"]
                
                # Check for errors
                if run_data.get("code") != 0 or run_data.get("signal"):
                    output["error"] = run_data.get("stderr") or "Execution failed"
                
                # Add execution time
                output["execution_time"] = run_data.get("wall_time", 0)
            
            # Extract compile output if present
            if "compile" in result:
                compile_data = result["compile"]
                
                # Add compile errors if present
                if compile_data.get("stderr"):
                    output["error"] = compile_data["stderr"]
                    output["success"] = False
                
                # Add compile output if present
                if compile_data.get("stdout"):
                    if output["output"]:
                        output["output"] = compile_data["stdout"] + "\n" + output["output"]
                    else:
                        output["output"] = compile_data["stdout"]
            
            return output
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error executing code with Piston: {str(e)}")
            return {
                "success": False,
                "error": f"Error connecting to code execution service: {str(e)}"
            }
        except Exception as e:
            logger.error(f"Unexpected error in execute_code: {str(e)}")
            return {
                "success": False,
                "error": f"Unexpected error: {str(e)}"
            }
    
    @classmethod
    def get_language_icon(cls, language: str) -> str:
        """Get the appropriate Font Awesome icon class for a language."""
        icon_map = {
            # Main languages with specific icons
            "python": "fab fa-python",
            "javascript": "fab fa-js",
            "typescript": "fab fa-js-square",
            "java": "fab fa-java",
            "c": "fas fa-code",
            "cpp": "fas fa-code",
            "c++": "fas fa-code",
            "csharp": "fab fa-microsoft",
            "go": "fab fa-golang",
            "ruby": "fas fa-gem",
            "rust": "fas fa-cogs",
            "php": "fab fa-php",
            "swift": "fab fa-swift",
            "kotlin": "fab fa-android",
            "dart": "fab fa-dart",
            "scala": "fas fa-s",
            "r": "fab fa-r-project",
            "rscript": "fab fa-r-project",
            "matlab": "fas fa-sigma",
            "octave": "fas fa-sigma",
            
            # Web technologies
            "html": "fab fa-html5",
            "css": "fab fa-css3-alt",
            
            # Scripting languages
            "bash": "fas fa-terminal",
            "powershell": "fas fa-terminal",
            "lua": "fas fa-moon",
            "perl": "fab fa-perl",
            
            # Functional languages
            "haskell": "fas fa-lambda",
            "elixir": "fas fa-bolt",
            "erlang": "fab fa-erlang",
            "clojure": "fas fa-code",
            "lisp": "fas fa-code",
            "racket": "fas fa-code",
            "fsharp": "fas fa-code",
            "ocaml": "fas fa-code",
            
            # Systems languages
            "zig": "fas fa-arrow-up",
            "vlang": "fas fa-v",
            "nim": "fas fa-code",
            "crystal": "fas fa-gem",
            
            # JVM languages
            "groovy": "fas fa-code",
            
            # .NET languages
            "fsharp.net": "fas fa-code",
            "vb": "fab fa-microsoft",
            "basic": "fab fa-microsoft",
            "basic.net": "fab fa-microsoft",
            
            # Other languages
            "d": "fas fa-code",
            "fortran": "fas fa-code",
            "cobol": "fas fa-code",
            "pascal": "fas fa-code",
            "prolog": "fas fa-code",
            "smalltalk": "fas fa-code",
            "sqlite3": "fas fa-database",
            "coffeescript": "fas fa-coffee",
            "julia": "fas fa-superscript",
            "raku": "fab fa-perl",
            "brainfuck": "far fa-brain",
            "befunge93": "fas fa-chess-board",
            "rockstar": "fas fa-guitar",
            "emojicode": "far fa-smile",
            "vyxal": "fas fa-v",
            "yeethon": "fas fa-yin-yang",
            "golfscript": "fas fa-golf-ball",
            "retina": "far fa-eye",
            "samarium": "fas fa-atom",
            "husk": "fas fa-otter",
            "iverilog": "fas fa-microchip",
            "japt": "fas fa-mountain",
            "llvm_ir": "fas fa-microchip",
            "osabie": "fas fa-chess",
            "paradoc": "fas fa-paragraph",
            "pyth": "fas fa-snake",
            "file": "far fa-file-code",
            "forte": "fas fa-music",
            "freebasic": "fas fa-bolt",
            "fsi": "fas fa-terminal"
        }
        return icon_map.get(language.lower(), "fas fa-code")

    @classmethod
    def get_codemirror_mode(cls, language: str) -> str:
        """Get the CodeMirror mode for a given language."""
        mode_map = {
            # Mainstream languages with specific modes
            "python": "python",
            "python2": "python",
            "python3": "python",
            "javascript": "javascript",
            "typescript": "javascript",
            "java": "clike",
            "c": "clike",
            "c++": "clike",
            "csharp": "clike",
            "csharp.net": "clike",
            "go": "go",
            "ruby": "ruby",
            "rust": "rust",
            "php": "php",
            "swift": "swift",
            "kotlin": "clike",
            "dart": "dart",
            "scala": "clike",
            "rscript": "r",
            "matlab": "octave",
            "octave": "octave",
            "bash": "shell",
            "powershell": "powershell",
            "lua": "lua",
            "perl": "perl",
            "haskell": "haskell",
            "elixir": "elixir",
            "erlang": "erlang",
            "clojure": "clojure",
            "lisp": "commonlisp",
            "racket": "scheme",
            "fsharp.net": "mllike",
            "ocaml": "mllike",
            "zig": "zig",
            "vlang": "go",
            "nim": "nim",
            "crystal": "crystal",
            "groovy": "groovy",
            "basic": "vb",
            "basic.net": "vb",
            "d": "d",
            "fortran": "fortran",
            "cobol": "cobol",
            "pascal": "pascal",
            "prolog": "prolog",
            "smalltalk": "smalltalk",
            "sqlite3": "sql",
            "coffeescript": "coffeescript",
            "julia": "julia",
            "raku": "perl",
            "brainfuck": "brainfuck",
            "llvm_ir": "llvm",
            "ponylang": "pony",
            "japt": "javascript",
            "iverilog": "verilog",
            "jelly": "jelly",
            "lolcode": "lolcode",
            "osabie": "osabie",
            "vyxal": "vyxal",
            "yeethon": "python",
            "file": "text/plain"
        }
        return mode_map.get(language.lower(), "text/plain")

    @classmethod
    def get_language_extension(cls, language: str) -> str:
        """Get the file extension for a given language."""
        extension_map = {
            # Mainstream languages
            "python": "py",
            "python2": "py",
            "python3": "py",
            "javascript": "js",
            "typescript": "ts",
            "java": "java",
            "c": "c",
            "c++": "cpp",
            "cpp": "cpp",
            "csharp": "cs",
            "csharp.net": "cs",
            "go": "go",
            "ruby": "rb",
            "rust": "rs",
            "php": "php",
            "swift": "swift",
            "kotlin": "kt",
            "dart": "dart",
            "scala": "scala",
            "rscript": "r",
            "r": "r",
            "matlab": "m",
            "octave": "m",
            "bash": "sh",
            "powershell": "ps1",
            "lua": "lua",
            "perl": "pl",
            "haskell": "hs",
            "elixir": "ex",
            "erlang": "erl",
            "clojure": "clj",
            "lisp": "lisp",
            "racket": "rkt",
            "fsharp.net": "fs",
            "fsharp": "fs",
            "ocaml": "ml",
            "zig": "zig",
            "vlang": "v",
            "nim": "nim",
            "crystal": "cr",
            "groovy": "groovy",
            "basic": "bas",
            "basic.net": "vb",
            "d": "d",
            "fortran": "f90",
            "cobol": "cbl",
            "pascal": "pas",
            "prolog": "pl",
            "smalltalk": "st",
            "sqlite3": "sql",
            "coffeescript": "coffee",
            "julia": "jl",
            "raku": "p6",
            "brainfuck": "bf",
            "befunge93": "bf93",
            "emojicode": "emojic",
            "golfscript": "gs",
            "llvm_ir": "ll",
            "ponylang": "pony",
            "pyth": "pyth",
            "rockstar": "rock",
            "samarium": "sm",
            "vyxal": "vy",
            "yeethon": "yeet",
            "japt": "js",
            "husk": "hs",
            "iverilog": "v",
            "jelly": "jelly",
            "lolcode": "lol",
            "osabie": "osabie",
            "paradoc": "pdc",
            "retina": "retina",
            "file": "txt",
            "html": "html",
            "css": "css",
            "elm": "elm",
            "solidity": "sol",
            "nasm": "asm",
            "nasm64": "asm",
            "assembly": "asm",
            "verilog": "v",
            "vhdl": "vhd",
            "tcl": "tcl"
        }
        return extension_map.get(language.lower(), "txt")
    
    @staticmethod
    def _get_file_extension(language: str) -> str:
        """Get the appropriate file extension for a language."""
        extension_map = {
            # Mainstream languages
            "python": "py",
            "python2": "py",
            "python3": "py",
            "javascript": "js",
            "typescript": "ts",
            "java": "java",
            "c": "c",
            "cpp": "cpp",
            "c++": "cpp",
            "csharp": "cs",
            "c#": "cs",
            "go": "go",
            "ruby": "rb",
            "rust": "rs",
            "php": "php",
            "swift": "swift",
            "kotlin": "kt",
            "dart": "dart",
            "scala": "scala",
            "groovy": "groovy",
            
            # Scripting languages
            "lua": "lua",
            "perl": "pl",
            "r": "r",
            "rscript": "r",
            "bash": "sh",
            "shell": "sh",
            "powershell": "ps1",
            
            # Functional languages
            "haskell": "hs",
            "elixir": "exs",
            "erlang": "erl",
            "clojure": "clj",
            "lisp": "lisp",
            "scheme": "scm",
            "racket": "rkt",
            "f#": "fs",
            "fsharp": "fs",
            "fsharp.net": "fs",
            "ocaml": "ml",
            
            # Systems languages
            "zig": "zig",
            "vlang": "v",
            "nim": "nim",
            "crystal": "cr",
            "d": "d",
            "fortran": "f90",
            "cobol": "cbl",
            "pascal": "pas",
            "ada": "adb",
            "assembly": "asm",
            "nasm": "asm",
            "nasm64": "asm",
            
            # JVM languages
            "scala": "scala",
            "groovy": "groovy",
            "clojure": "clj",
            
            # .NET languages
            "fsharp": "fs",
            "basic": "vb",
            "vb": "vb",
            "vb.net": "vb",
            
            # Other languages
            "matlab": "m",
            "octave": "m",
            "sql": "sql",
            "sqlite3": "sql",
            "prolog": "pl",
            "lolcode": "lol",
            "brainfuck": "bf",
            "befunge93": "b93",
            "emojicode": "emojic",
            "rockstar": "rock",
            "vyxal": "vy",
            "jelly": "jelly",
            "osabie": "osabie",
            "paradoc": "pdc",
            "ponylang": "pony",
            "samarium": "sm",
            "smalltalk": "st",
            "tcl": "tcl",
            "verilog": "v",
            "vhdl": "vhd",
            "coffeescript": "coffee",
            "html": "html",
            "css": "css",
            "elm": "elm",
            "solidity": "sol",
            "llvm_ir": "ll",
            "yeethon": "py"
        }
        # Get appropriate extension without adding a period
        return extension_map.get(language.lower(), "txt")
    
    @classmethod
    def get_language_template(cls, language: str) -> str:
        """Get a code template for the specified language."""
        templates = {
            "python": '''# Welcome to your Python space!

def main():
    """Main function that runs when this script is executed."""
    print("Hello, World!")

    # Try adding your own code below:
    name = "Python Coder"
    print(f"Welcome, {name}!")

    # You can use loops:
    for i in range(3):
        print(f"Count: {i}")

    # And conditions:
    if name == "Python Coder":
        print("You're a Python coder!")
    else:
        print("You can become a Python coder!")

# Standard Python idiom to call the main function
if __name__ == "__main__":
    main()
''',
            "javascript": '''// Welcome to your JavaScript space!

function main() {
    console.log("Hello, World!");
    
    // Try adding your own code below:
    const name = "JavaScript Coder";
    console.log(`Welcome, ${name}!`);
    
    // You can use loops:
    for (let i = 0; i < 3; i++) {
        console.log(`Count: ${i}`);
    }
    
    // And conditions:
    if (name === "JavaScript Coder") {
        console.log("You're a JavaScript coder!");
    } else {
        console.log("You can become a JavaScript coder!");
    }
}

// Call the main function
main();
''',
            "java": '''// Welcome to your Java space!

public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
        
        // Try adding your own code below:
        String name = "Java Coder";
        System.out.println("Welcome, " + name + "!");
        
        // You can use loops:
        for (int i = 0; i < 3; i++) {
            System.out.println("Count: " + i);
        }
        
        // And conditions:
        if (name.equals("Java Coder")) {
            System.out.println("You're a Java coder!");
        } else {
            System.out.println("You can become a Java coder!");
        }
    }
}
''',
            "c": '''// Welcome to your C space!
#include <stdio.h>
#include <string.h>

int main() {
    printf("Hello, World!\\n");
    
    // Try adding your own code below:
    char name[] = "C Coder";
    printf("Welcome, %s!\\n", name);
    
    // You can use loops:
    for (int i = 0; i < 3; i++) {
        printf("Count: %d\\n", i);
    }
    
    // And conditions:
    if (strcmp(name, "C Coder") == 0) {
        printf("You're a C coder!\\n");
    } else {
        printf("You can become a C coder!\\n");
    }
    
    return 0;
}
''',
            "cpp": '''// Welcome to your C++ space!
#include <iostream>
#include <string>

int main() {
    std::cout << "Hello, World!" << std::endl;
    
    // Try adding your own code below:
    std::string name = "C++ Coder";
    std::cout << "Welcome, " << name << "!" << std::endl;
    
    // You can use loops:
    for (int i = 0; i < 3; i++) {
        std::cout << "Count: " << i << std::endl;
    }
    
    // And conditions:
    if (name == "C++ Coder") {
        std::cout << "You're a C++ coder!" << std::endl;
    } else {
        std::cout << "You can become a C++ coder!" << std::endl;
    }
    
    return 0;
}
''',
            "c++": '''// Welcome to your C++ space!
#include <iostream>
#include <string>

int main() {
    std::cout << "Hello, World!" << std::endl;
    
    // Try adding your own code below:
    std::string name = "C++ Coder";
    std::cout << "Welcome, " << name << "!" << std::endl;
    
    // You can use loops:
    for (int i = 0; i < 3; i++) {
        std::cout << "Count: " << i << std::endl;
    }
    
    // And conditions:
    if (name == "C++ Coder") {
        std::cout << "You're a C++ coder!" << std::endl;
    } else {
        std::cout << "You can become a C++ coder!" << std::endl;
    }
    
    return 0;
}
''',
            "csharp": '''// Welcome to your C# space!
using System;

class Program {
    static void Main() {
        Console.WriteLine("Hello, World!");
        
        // Try adding your own code below:
        string name = "C# Coder";
        Console.WriteLine($"Welcome, {name}!");
        
        // You can use loops:
        for (int i = 0; i < 3; i++) {
            Console.WriteLine($"Count: {i}");
        }
        
        // And conditions:
        if (name == "C# Coder") {
            Console.WriteLine("You're a C# coder!");
        } else {
            Console.WriteLine("You can become a C# coder!");
        }
    }
}
''',
            "go": '''// Welcome to your Go space!
package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
    
    // Try adding your own code below:
    name := "Go Coder"
    fmt.Printf("Welcome, %s!\n", name)
    
    // You can use loops:
    for i := 0; i < 3; i++ {
        fmt.Printf("Count: %d\n", i)
    }
    
    // And conditions:
    if name == "Go Coder" {
        fmt.Println("You're a Go coder!")
    } else {
        fmt.Println("You can become a Go coder!")
    }
}
''',
            "ruby": '''# Welcome to your Ruby space!

def main
  puts "Hello, World!"
  
  # Try adding your own code below:
  name = "Ruby Coder"
  puts "Welcome, #{name}!"
  
  # You can use loops:
  3.times do |i|
    puts "Count: #{i}"
  end
  
  # And conditions:
  if name == "Ruby Coder"
    puts "You're a Ruby coder!"
  else
    puts "You can become a Ruby coder!"
  end
end

# Call the main function
main
''',
            "rust": '''// Welcome to your Rust space!

fn main() {
    println!("Hello, World!");
    
    // Try adding your own code below:
    let name = "Rust Coder";
    println!("Welcome, {}!", name);
    
    // You can use loops:
    for i in 0..3 {
        println!("Count: {}", i);
    }
    
    // And conditions:
    if name == "Rust Coder" {
        println!("You're a Rust coder!");
    } else {
        println!("You can become a Rust coder!");
    }
}
''',
            "typescript": '''// Welcome to your TypeScript space!

function main(): void {
    console.log("Hello, World!");
    
    // Try adding your own code below:
    const name: string = "TypeScript Coder";
    console.log(`Welcome, ${name}!`);
    
    // You can use loops:
    for (let i: number = 0; i < 3; i++) {
        console.log(`Count: ${i}`);
    }
    
    // And conditions:
    if (name === "TypeScript Coder") {
        console.log("You're a TypeScript coder!");
    } else {
        console.log("You can become a TypeScript coder!");
    }
}

// Call the main function
main();
''',
            "php": '''<?php
// Welcome to your PHP space!

function main() {
    echo "Hello, World!\n";
    
    // Try adding your own code below:
    $name = "PHP Coder";
    echo "Welcome, $name!\n";
    
    // You can use loops:
    for ($i = 0; $i < 3; $i++) {
        echo "Count: $i\n";
    }
    
    // And conditions:
    if ($name == "PHP Coder") {
        echo "You're a PHP coder!\n";
    } else {
        echo "You can become a PHP coder!\n";
    }
}

// Call the main function
main();
?>
''',
            "swift": '''// Welcome to your Swift space!

func main() {
    print("Hello, World!")
    
    // Try adding your own code below:
    let name = "Swift Coder"
    print("Welcome, \(name)!")
    
    // You can use loops:
    for i in 0..<3 {
        print("Count: \(i)")
    }
    
    // And conditions:
    if name == "Swift Coder" {
        print("You're a Swift coder!")
    } else {
        print("You can become a Swift coder!")
    }
}

// Call the main function
main()
''',
            "kotlin": '''// Welcome to your Kotlin space!

fun main() {
    println("Hello, World!")
    
    // Try adding your own code below:
    val name = "Kotlin Coder"
    println("Welcome, $name!")
    
    // You can use loops:
    for (i in 0..2) {
        println("Count: $i")
    }
    
    // And conditions:
    if (name == "Kotlin Coder") {
        println("You're a Kotlin coder!")
    } else {
        println("You can become a Kotlin coder!")
    }
}
''',
            "dart": '''// Welcome to your Dart space!

void main() {
  print('Hello, World!');
  
  // Try adding your own code below:
  var name = 'Dart Coder';
  print('Welcome, $name!');
  
  // You can use loops:
  for (var i = 0; i < 3; i++) {
    print('Count: $i');
  }
  
  // And conditions:
  if (name == 'Dart Coder') {
    print('You\'re a Dart coder!');
  } else {
    print('You can become a Dart coder!');
  }
}
''',
            "scala": '''// Welcome to your Scala space!

object Main extends App {
  println("Hello, World!")
  
  // Try adding your own code below:
  val name = "Scala Coder"
  println(s"Welcome, $name!")
  
  // You can use loops:
  for (i <- 0 until 3) {
    println(s"Count: $i")
  }
  
  // And conditions:
  if (name == "Scala Coder") {
    println("You're a Scala coder!")
  } else {
    println("You can become a Scala coder!")
  }
}
''',
            "haskell": '''-- Welcome to your Haskell space!

main :: IO ()
main = do
  putStrLn "Hello, World!"
  
  -- Try adding your own code below:
  let name = "Haskell Coder"
  putStrLn $ "Welcome, " ++ name ++ "!"
  
  -- You can use loops:
  let loop i = 
        if i < 3
          then do
            putStrLn $ "Count: " ++ show i
            loop (i + 1)
          else return ()
  loop 0
  
  -- And conditions:
  if name == "Haskell Coder"
    then putStrLn "You're a Haskell coder!"
    else putStrLn "You can become a Haskell coder!"
''',
            "elixir": '''# Welcome to your Elixir space!

defmodule Main do
  def main do
    IO.puts "Hello, World!"
    
    # Try adding your own code below:
    name = "Elixir Coder"
    IO.puts "Welcome, #{name}!"
    
    # You can use loops:
    for i <- 0..2 do
      IO.puts "Count: #{i}"
    end
    
    # And conditions:
    if name == "Elixir Coder" do
      IO.puts "You're an Elixir coder!"
    else
      IO.puts "You can become an Elixir coder!"
    end
  end
end

# Call the main function
Main.main()
''',
            "bash": '''#!/bin/bash
# Welcome to your Bash space!

# Main function
main() {
    echo "Hello, World!"
    
    # Try adding your own code below:
    name="Bash Coder"
    echo "Welcome, $name!"
    
    # You can use loops:
    for i in {0..2}; do
        echo "Count: $i"
    done
    
    # And conditions:
    if [ "$name" == "Bash Coder" ]; then
        echo "You're a Bash coder!"
    else
        echo "You can become a Bash coder!"
    fi
}

# Call the main function
main
''',
            "lua": '''-- Welcome to your Lua space!

function main()
    print("Hello, World!")
    
    -- Try adding your own code below:
    local name = "Lua Coder"
    print("Welcome, " .. name .. "!")
    
    -- You can use loops:
    for i = 0, 2 do
        print("Count: " .. i)
    end
    
    -- And conditions:
    if name == "Lua Coder" then
        print("You're a Lua coder!")
    else
        print("You can become a Lua coder!")
    end
end

-- Call the main function
main()
''',
            "perl": '''# Welcome to your Perl space!

sub main {
    print "Hello, World!\n";
    
    # Try adding your own code below:
    my $name = "Perl Coder";
    print "Welcome, $name!\n";
    
    # You can use loops:
    for (my $i = 0; $i < 3; $i++) {
        print "Count: $i\n";
    }
    
    # And conditions:
    if ($name eq "Perl Coder") {
        print "You're a Perl coder!\n";
    } else {
        print "You can become a Perl coder!\n";
    }
}

# Call the main function
main();
''',
            "r": '''# Welcome to your R space!

main <- function() {
  print("Hello, World!")
  
  # Try adding your own code below:
  name <- "R Coder"
  print(paste("Welcome,", name, "!"))
  
  # You can use loops:
  for (i in 0:2) {
    print(paste("Count:", i))
  }
  
  # And conditions:
  if (name == "R Coder") {
    print("You're an R coder!")
  } else {
    print("You can become an R coder!")
  }
}

# Call the main function
main()
''',
            "rscript": '''# Welcome to your R space!

main <- function() {
  print("Hello, World!")
  
  # Try adding your own code below:
  name <- "R Coder"
  print(paste("Welcome,", name, "!"))
  
  # You can use loops:
  for (i in 0:2) {
    print(paste("Count:", i))
  }
  
  # And conditions:
  if (name == "R Coder") {
    print("You're an R coder!")
  } else {
    print("You can become an R coder!")
  }
}

# Call the main function
main()
''',
            "groovy": '''// Welcome to your Groovy space!

def main() {
    println "Hello, World!"
    
    // Try adding your own code below:
    def name = "Groovy Coder"
    println "Welcome, ${name}!"
    
    // You can use loops:
    3.times { i ->
        println "Count: ${i}"
    }
    
    // And conditions:
    if (name == "Groovy Coder") {
        println "You're a Groovy coder!"
    } else {
        println "You can become a Groovy coder!"
    }
}

// Call the main function
main()
''',
            "nim": '''# Welcome to your Nim space!

proc main() =
  echo "Hello, World!"
  
  # Try adding your own code below:
  let name = "Nim Coder"
  echo "Welcome, ", name, "!"
  
  # You can use loops:
  for i in 0..<3:
    echo "Count: ", i
  
  # And conditions:
  if name == "Nim Coder":
    echo "You're a Nim coder!"
  else:
    echo "You can become a Nim coder!"

# Call the main function
main()
''',
            "zig": '''// Welcome to your Zig space!
const std = @import("std");

pub fn main() !void {
    const stdout = std.io.getStdOut().writer();
    try stdout.print("Hello, World!\n", .{});
    
    // Try adding your own code below:
    const name = "Zig Coder";
    try stdout.print("Welcome, {s}!\n", .{name});
    
    // You can use loops:
    var i: u8 = 0;
    while (i < 3) : (i += 1) {
        try stdout.print("Count: {}\n", .{i});
    }
    
    // And conditions:
    if (std.mem.eql(u8, name, "Zig Coder")) {
        try stdout.print("You're a Zig coder!\n", .{});
    } else {
        try stdout.print("You can become a Zig coder!\n", .{});
    }
}
''',
            "crystal": '''# Welcome to your Crystal space!

def main
  puts "Hello, World!"
  
  # Try adding your own code below:
  name = "Crystal Coder"
  puts "Welcome, #{name}!"
  
  # You can use loops:
  3.times do |i|
    puts "Count: #{i}"
  end
  
  # And conditions:
  if name == "Crystal Coder"
    puts "You're a Crystal coder!"
  else
    puts "You can become a Crystal coder!"
  end
end

# Call the main function
main
''',
            "julia": '''# Welcome to your Julia space!

function main()
    println("Hello, World!")
    
    # Try adding your own code below:
    name = "Julia Coder"
    println("Welcome, $name!")
    
    # You can use loops:
    for i in 0:2
        println("Count: $i")
    end
    
    # And conditions:
    if name == "Julia Coder"
        println("You're a Julia coder!")
    else
        println("You can become a Julia coder!")
    end
end

# Call the main function
main()
''',
            "d": '''// Welcome to your D space!
import std.stdio;

void main() {
    writeln("Hello, World!");
    
    // Try adding your own code below:
    string name = "D Coder";
    writeln("Welcome, ", name, "!");
    
    // You can use loops:
    foreach (i; 0..3) {
        writeln("Count: ", i);
    }
    
    // And conditions:
    if (name == "D Coder") {
        writeln("You're a D coder!");
    } else {
        writeln("You can become a D coder!");
    }
}
''',
            "cobol": '''      * Welcome to your COBOL space!
       IDENTIFICATION DIVISION.
       PROGRAM-ID. HELLO.
       
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 NAME PIC X(20) VALUE "COBOL Coder".
       01 I PIC 9(1) VALUE 0.
       
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "Hello, World!".
           
           DISPLAY "Welcome, ", NAME, "!".
           
           PERFORM VARYING I FROM 0 BY 1 UNTIL I > 2
               DISPLAY "Count: ", I
           END-PERFORM.
           
           IF NAME = "COBOL Coder" THEN
               DISPLAY "You're a COBOL coder!"
           ELSE
               DISPLAY "You can become a COBOL coder!"
           END-IF.
           
           STOP RUN.
''',
            "basic": '''REM Welcome to your BASIC space!

SUB Main()
    PRINT "Hello, World!"
    
    REM Try adding your own code below:
    name$ = "BASIC Coder"
    PRINT "Welcome, "; name$; "!"
    
    REM You can use loops:
    FOR i = 0 TO 2
        PRINT "Count: "; i
    NEXT i
    
    REM And conditions:
    IF name$ = "BASIC Coder" THEN
        PRINT "You're a BASIC coder!"
    ELSE
        PRINT "You can become a BASIC coder!"
    END IF
END SUB

Main
''',
            "fortran": '''! Welcome to your Fortran space!
program main
    implicit none
    
    ! Try adding your own code below:
    character(len=20) :: name = "Fortran Coder"
    integer :: i
    
    print *, "Hello, World!"
    print *, "Welcome, ", trim(name), "!"
    
    ! You can use loops:
    do i = 0, 2
        print *, "Count: ", i
    end do
    
    ! And conditions:
    if (name == "Fortran Coder") then
        print *, "You're a Fortran coder!"
    else
        print *, "You can become a Fortran coder!"
    end if
    
end program main
''',
            "pascal": '''(* Welcome to your Pascal space! *)
program HelloWorld;

var
  name: string;
  i: integer;

begin
  writeln('Hello, World!');
  
  (* Try adding your own code below: *)
  name := 'Pascal Coder';
  writeln('Welcome, ', name, '!');
  
  (* You can use loops: *)
  for i := 0 to 2 do
    writeln('Count: ', i);
  
  (* And conditions: *)
  if name = 'Pascal Coder' then
    writeln('You''re a Pascal coder!')
  else
    writeln('You can become a Pascal coder!');
end.
''',
            "prolog": '''% Welcome to your Prolog space!

main :-
    write('Hello, World!'), nl,
    
    % Try adding your own code below:
    Name = 'Prolog Coder',
    format('Welcome, ~w!~n', [Name]),
    
    % You can use loops:
    forall(between(0, 2, I),
           format('Count: ~w~n', [I])),
    
    % And conditions:
    (Name = 'Prolog Coder' ->
        write('You\'re a Prolog coder!')
    ;
        write('You can become a Prolog coder!')),
    
    nl.

:- main.
''',
            "erlang": '''%% Welcome to your Erlang space!

-module(main).
-export([start/0]).

start() ->
    io:format("Hello, World!~n"),
    
    %% Try adding your own code below:
    Name = "Erlang Coder",
    io:format("Welcome, ~s!~n", [Name]),
    
    %% You can use loops:
    lists:foreach(fun(I) -> 
        io:format("Count: ~p~n", [I]) 
    end, lists:seq(0, 2)),
    
    %% And conditions:
    case Name of
        "Erlang Coder" ->
            io:format("You're an Erlang coder!~n");
        _ ->
            io:format("You can become an Erlang coder!~n")
    end.
''',
            "ocaml": '''(* Welcome to your OCaml space! *)

let main () =
  print_endline "Hello, World!";
  
  (* Try adding your own code below: *)
  let name = "OCaml Coder" in
  Printf.printf "Welcome, %s!\n" name;
  
  (* You can use loops: *)
  for i = 0 to 2 do
    Printf.printf "Count: %d\n" i
  done;
  
  (* And conditions: *)
  if name = "OCaml Coder" then
    print_endline "You're an OCaml coder!"
  else
    print_endline "You can become an OCaml coder!"

let () = main ()
''',
            "clojure": ''';;; Welcome to your Clojure space!

(defn main []
  (println "Hello, World!")
  
  ; Try adding your own code below:
  (let [name "Clojure Coder"]
    (println "Welcome," name "!")
    
    ; You can use loops:
    (doseq [i (range 3)]
      (println "Count:" i))
    
    ; And conditions:
    (if (= name "Clojure Coder")
      (println "You're a Clojure coder!")
      (println "You can become a Clojure coder!"))))

; Call the main function
(main)
''',
            "coffeescript": '''# Welcome to your CoffeeScript space!

main = ->
  console.log "Hello, World!"
  
  # Try adding your own code below:
  name = "CoffeeScript Coder"
  console.log "Welcome, #{name}!"
  
  # You can use loops:
  for i in [0..2]
    console.log "Count: #{i}"
  
  # And conditions:
  if name is "CoffeeScript Coder"
    console.log "You're a CoffeeScript coder!"
  else
    console.log "You can become a CoffeeScript coder!"

# Call the main function
main()
''',
            "racket": '''#lang racket
;; Welcome to your Racket space!

(define (main)
  (displayln "Hello, World!")
  
  ;; Try adding your own code below:
  (define name "Racket Coder")
  (printf "Welcome, ~a!~n" name)
  
  ;; You can use loops:
  (for ([i (in-range 3)])
    (printf "Count: ~a~n" i))
  
  ;; And conditions:
  (if (equal? name "Racket Coder")
      (displayln "You're a Racket coder!")
      (displayln "You can become a Racket coder!")))

;; Call the main function
(main)
''',
            "powershell": '''# Welcome to your PowerShell space!

function Main {
    Write-Host "Hello, World!"
    
    # Try adding your own code below:
    $name = "PowerShell Coder"
    Write-Host "Welcome, $name!"
    
    # You can use loops:
    for ($i = 0; $i -lt 3; $i++) {
        Write-Host "Count: $i"
    }
    
    # And conditions:
    if ($name -eq "PowerShell Coder") {
        Write-Host "You're a PowerShell coder!"
    } else {
        Write-Host "You can become a PowerShell coder!"
    }
}

# Call the main function
Main
''',
            "fsharp": '''// Welcome to your F# space!

let main() =
    printfn "Hello, World!"
    
    // Try adding your own code below:
    let name = "F# Coder"
    printfn "Welcome, %s!" name
    
    // You can use loops:
    for i in 0..2 do
        printfn "Count: %d" i
    
    // And conditions:
    if name = "F# Coder" then
        printfn "You're an F# coder!"
    else
        printfn "You can become an F# coder!"

// Call the main function
main()
''',
            "fsharp.net": '''// Welcome to your F# space!

let main() =
    printfn "Hello, World!"
    
    // Try adding your own code below:
    let name = "F# Coder"
    printfn "Welcome, %s!" name
    
    // You can use loops:
    for i in 0..2 do
        printfn "Count: %d" i
    
    // And conditions:
    if name = "F# Coder" then
        printfn "You're an F# coder!"
    else
        printfn "You can become an F# coder!"

// Call the main function
main()
''',
            "html": '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My HTML Space</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            line-height: 1.6;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            border: 1px solid #ddd;
            border-radius: 5px;
        }
        h1 {
            color: #333;
        }
        .highlight {
            background-color: #f0f0f0;
            padding: 10px;
            border-left: 3px solid #3498db;
        }
        button {
            background-color: #3498db;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 4px;
            cursor: pointer;
        }
        button:hover {
            background-color: #2980b9;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Welcome to my HTML Space!</h1>
        
        <p>This is a simple HTML template to get you started. Feel free to modify it!</p>
        
        <div class="highlight">
            <p>Try changing the styles, adding new elements, or implementing JavaScript functionality.</p>
        </div>
        
        <h2>Things to try:</h2>
        <ul>
            <li>Add more sections to this page</li>
            <li>Change the colors and styling</li>
            <li>Add images or videos</li>
            <li>Implement a simple form</li>
        </ul>
        
        <button id="demoButton">Click Me!</button>
        
        <p id="demoText"></p>
    </div>

    <script>
        // Simple JavaScript example
        document.getElementById('demoButton').addEventListener('click', function() {
            document.getElementById('demoText').textContent = 'Button was clicked at ' + new Date().toLocaleTimeString();
        });
    </script>
</body>
</html>
''',
            "css": '''/* Welcome to your CSS Space!
   This is a template with some common CSS styles */

/* Reset and base styles */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Arial', sans-serif;
    line-height: 1.6;
    color: #333;
    background-color: #f5f5f5;
    padding: 20px;
}

/* Container */
.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
    background-color: white;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
}

/* Typography */
h1, h2, h3, h4, h5, h6 {
    margin-bottom: 15px;
    color: #222;
}

h1 {
    font-size: 2.5em;
}

h2 {
    font-size: 2em;
}

p {
    margin-bottom: 15px;
}

/* Links */
a {
    color: #3498db;
    text-decoration: none;
    transition: color 0.3s;
}

a:hover {
    color: #2980b9;
    text-decoration: underline;
}

/* Buttons */
.button {
    display: inline-block;
    padding: 10px 15px;
    background-color: #3498db;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.3s;
}

.button:hover {
    background-color: #2980b9;
}

.button.secondary {
    background-color: #95a5a6;
}

.button.secondary:hover {
    background-color: #7f8c8d;
}

/* Cards */
.card {
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 20px;
    margin-bottom: 20px;
}

.card-header {
    padding-bottom: 10px;
    border-bottom: 1px solid #eee;
    margin-bottom: 15px;
}

/* Form elements */
input[type="text"],
input[type="email"],
textarea {
    width: 100%;
    padding: 10px;
    margin-bottom: 15px;
    border: 1px solid #ddd;
    border-radius: 4px;
}

/* Utility classes */
.text-center {
    text-align: center;
}

.text-right {
    text-align: right;
}

.mb-1 {
    margin-bottom: 10px;
}

.mb-2 {
    margin-bottom: 20px;
}

.mb-3 {
    margin-bottom: 30px;
}

/* Media queries */
@media (max-width: 768px) {
    h1 {
        font-size: 2em;
    }
    
    .container {
        padding: 10px;
    }
}

@media (max-width: 480px) {
    body {
        padding: 10px;
    }
}
'''
        }
        
        # For languages not in the explicit templates, generate a generic template
        if language in templates:
            return templates[language]
        
        # Generate generic templates for languages that don't have a specific template
        language_capitalized = language.capitalize()
        
        # Group languages by syntax family to generate appropriate templates
        if language in ["javascript", "typescript", "coffeescript", "dart", "solidity"]:
            return f"// Welcome to your {language_capitalized} space!\n\nfunction main() {{\n  console.log(\"Hello, World!\");\n\n  // Write your code here\n}}\n\nmain();\n"
        
        elif language in ["python", "ruby", "crystal", "nim"]:
            return f"# Welcome to your {language_capitalized} space!\n\ndef main():\n    print(\"Hello, World!\")\n    \n    # Write your code here\n\n# Call the main function\nmain()\n"
        
        elif language in ["lua", "moonscript"]:
            return f"-- Welcome to your {language_capitalized} space!\n\nfunction main()\n    print(\"Hello, World!\")\n    \n    -- Write your code here\nend\n\nmain()\n"
        
        elif language in ["c", "cpp", "c++", "java", "csharp", "d", "rust", "go", "swift", "kotlin"]:
            main_func = f"func" if language == 'go' else ("int" if language in ['c', 'cpp', 'c++'] else "void")
            return_str = f"// Welcome to your {language_capitalized} space!\n\n// Main function\n{main_func} main() {{\n    // Write your code here\n    printf(\"Hello, World!\\\\n\");\n"
            if language in ['c', 'cpp', 'c++']:
                return_str += "    return 0;\n"
            return_str += "}}\n"
            return return_str
        
        elif language in ["bash", "powershell", "shell"]:
            prefix = "#!" + ("/bin/bash" if language == "bash" else "")
            return f"{prefix}\n# Welcome to your {language_capitalized} space!\n\nfunction main() {{\n    echo \"Hello, World!\"\n    \n    # Write your code here\n}}\n\n# Call the main function\nmain\n"
        
        elif language in ["r", "rscript"]:
            return f"# Welcome to your R space!\n\nmain <- function() {{\n  print(\"Hello, World!\")\n  \n  # Write your code here\n}}\n\n# Call the main function\nmain()\n"
        
        elif language in ["php"]:
            return f"<?php\n// Welcome to your PHP space!\n\nfunction main() {{\n    echo \"Hello, World!\\n\";\n    \n    // Write your code here\n}}\n\n// Call the main function\nmain();\n?>\n"
        
        elif language in ["haskell", "fsharp", "ocaml", "elm"]:
            return f"-- Welcome to your {language_capitalized} space!\n\nmain = do\n  putStrLn \"Hello, World!\"\n  \n  -- Write your code here\n\n-- Execute main function\nmain\n"
        
        elif language in ["clojure", "scheme", "racket", "lisp"]:
            return f";;; Welcome to your {language_capitalized} space!\n\n(defn main []\n  (println \"Hello, World!\")\n  \n  ;; Write your code here\n)\n\n;; Call the main function\n(main)\n"
        
        elif language == "html":
            return f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My {language_capitalized} Space</title>
    <style>
        body {{
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
        }}
        .container {{
            max-width: 800px;
            margin: 0 auto;
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>Welcome to my {language_capitalized} Space!</h1>
        <p>Edit this template and make it your own!</p>
    </div>
</body>
</html>'''
        
        elif language == "css":
            return f'''/* Welcome to your CSS Space */

body {{
    font-family: Arial, sans-serif;
    margin: 0;
    padding: 0;
    background-color: #f5f5f5;
}}

.container {{
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}}

h1 {{
    color: #333;
}}

p {{
    line-height: 1.6;
}}
'''
        
        # Default template for any other language
        return f"// Welcome to your {language_capitalized} space!\n\n// Write your code here\nprint(\"Hello, World!\");\n"
