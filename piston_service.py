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
        payload = {
            "language": language,
            "version": version,
            "files": [
                {
                    "name": f"main.{cls._get_file_extension(language)}",
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
            "java": "fab fa-java",
            "c": "fas fa-c",
            "c++": "fas fa-code",
            "csharp": "fab fa-microsoft",
            "go": "fab fa-golang",
            "ruby": "fas fa-gem",
            "rust": "fas fa-cog",
            "php": "fab fa-php",
            "swift": "fab fa-swift",
            "kotlin": "fab fa-android",
            "dart": "fab fa-dart",
            "scala": "fas fa-s",
            "r": "fab fa-r-project",
            "matlab": "fas fa-sigma",
            "octave": "fas fa-sigma",
            "html": "fab fa-html5",
            "css": "fab fa-css3-alt",
            "bash": "fas fa-terminal",
            "powershell": "fas fa-terminal",
            "lua": "fas fa-moon",
            "perl": "fab fa-perl",
            "haskell": "fas fa-lambda",
            "elixir": "fas fa-bolt",
            "erlang": "fab fa-erlang",
            "clojure": "fas fa-code",
            "lisp": "fas fa-code",
            "racket": "fas fa-code",
            "fsharp.net": "fas fa-code",
            "ocaml": "fas fa-code",
            "zig": "fas fa-arrow-up",
            "vlang": "fas fa-v",
            "nim": "fas fa-code",
            "crystal": "fas fa-gem",
            "groovy": "fas fa-code",
            "basic": "fab fa-microsoft",
            "basic.net": "fab fa-microsoft",
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
            "raku": "fab fa-perl",
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
            "file": "txt"
        }
        return extension_map.get(language.lower(), "txt")
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
            "typescript": "fab fa-js-square",
            "javascript": "fab fa-js-square",
            
            # Scripting languages
            "bash": "fas fa-terminal",
            "powershell": "fas fa-terminal",
            "lua": "fas fa-moon",
            "perl": "fab fa-perl",
            "ruby": "fas fa-gem",
            "python": "fab fa-python",
            "php": "fab fa-php",
            "dart": "fab fa-dart",
            
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
            "c": "fas fa-c",
            "cpp": "fas fa-code",
            "rust": "fas fa-cog",
            "go": "fab fa-golang",
            "zig": "fas fa-arrow-up",
            "vlang": "fas fa-v",
            "nim": "fas fa-code",
            "crystal": "fas fa-gem",
            
            # JVM languages
            "java": "fab fa-java",
            "kotlin": "fab fa-android",
            "scala": "fas fa-s",
            "groovy": "fas fa-code",
            "clojure": "fas fa-code",
            
            # .NET languages
            "csharp": "fab fa-microsoft",
            "fsharp": "fas fa-code",
            "vb": "fab fa-microsoft",
            
            # Other languages
            "swift": "fab fa-swift",
            "dart": "fab fa-dart",
            "r": "fab fa-r-project",
            "rscript": "fab fa-r-project",
            "matlab": "fas fa-sigma",
            "octave": "fas fa-sigma",
            "sql": "fas fa-database",
            "sqlite3": "fas fa-database",
            "bash": "fas fa-terminal",
            "powershell": "fas fa-terminal",
            "lua": "fas fa-moon",
            "perl": "fab fa-perl",
            "ruby": "fas fa-gem",
            "python": "fab fa-python",
            "php": "fab fa-php",
            "dart": "fab fa-dart",
            "haskell": "fas fa-lambda",
            "elixir": "fas fa-bolt",
            "erlang": "fab fa-erlang",
            "clojure": "fas fa-code",
            "lisp": "fas fa-code",
            "racket": "fas fa-code",
            "fsharp": "fas fa-code",
            "ocaml": "fas fa-code",
            "c": "fas fa-c",
            "cpp": "fas fa-code",
            "rust": "fas fa-cog",
            "go": "fab fa-golang",
            "zig": "fas fa-arrow-up",
            "vlang": "fas fa-v",
            "nim": "fas fa-code",
            "crystal": "fas fa-gem",
            "java": "fab fa-java",
            "kotlin": "fab fa-android",
            "scala": "fas fa-s",
            "groovy": "fas fa-code",
            "clojure": "fas fa-code",
            "csharp": "fab fa-microsoft",
            "fsharp": "fas fa-code",
            "vb": "fab fa-microsoft",
            "swift": "fab fa-swift",
            "dart": "fab fa-dart",
            "r": "fab fa-r-project",
            "rscript": "fab fa-r-project",
            "matlab": "fas fa-sigma",
            "octave": "fas fa-sigma",
            "sql": "fas fa-database",
            "sqlite3": "fas fa-database"
        }
        return icon_map.get(language.lower(), "fas fa-code")
    
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
            "ruby": "rb",
            "php": "php",
            "python": "py",
            "python2": "py",
            "python3": "py",
            
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
            "ocaml": "ml",
            
            # Systems languages
            "c": "c",
            "cpp": "cpp",
            "rust": "rs",
            "go": "go",
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
            "java": "java",
            "kotlin": "kt",
            "scala": "scala",
            "groovy": "groovy",
            "clojure": "clj",
            
            # .NET languages
            "csharp": "cs",
            "fsharp": "fs",
            "basic": "vb",
            "vb": "vb",
            "vb.net": "vb",
            
            # Other languages
            "swift": "swift",
            "dart": "dart",
            "r": "r",
            "rscript": "r",
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
            "typescript": "ts",
            "javascript": "js",
            "html": "html",
            "css": "css",
            "elm": "elm",
            "solidity": "sol",
            "llvm_ir": "ll",
            "yeethon": "py"
        }
        # Get appropriate extension or default to language name + txt if not found
        return extension_map.get(language.lower(), f"{language.lower()}.txt")
    
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
'''
        }
        
        # Additional templates for common languages
        if language == "php":
            return "<?php\n\n// Welcome to your PHP space!\n\nfunction main() {\n    echo \"Hello, World!\";\n    \n    // Try adding your own code below:\n    $name = \"PHP Coder\";\n    echo \"\nWelcome, $name!\";\n    \n    // You can use loops:\n    for ($i = 0; $i < 3; $i++) {\n        echo \"\nCount: $i\";\n    }\n    \n    // And conditions:\n    if ($name === \"PHP Coder\") {\n        echo \"\nYou're a PHP coder!\";\n    } else {\n        echo \"\nYou can become a PHP coder!\";\n    }\n}\n\n// Call the main function\nmain();\n";
        elif language == "swift":
            return "// Welcome to your Swift space!\n\nfunc main() {\n    print(\"Hello, World!\")\n    \n    // Try adding your own code below:\n    let name = \"Swift Coder\"\n    print(\"Welcome, \\(name)!\")\n    \n    // You can use loops:\n    for i in 0..<3 {\n        print(\"Count: \\(i)\")\n    }\n    \n    // And conditions:\n    if name == \"Swift Coder\" {\n        print(\"You're a Swift coder!\")\n    } else {\n        print(\"You can become a Swift coder!\")\n    }\n}\n\n// Call the main function\nmain()\n";
        elif language == "kotlin":
            return "// Welcome to your Kotlin space!\n\nfun main() {\n    println(\"Hello, World!\")\n    \n    // Try adding your own code below:\n    val name = \"Kotlin Coder\"\n    println(\"Welcome, $name!\")\n    \n    // You can use loops:\n    for (i in 0..2) {\n        println(\"Count: $i\")\n    }\n    \n    // And conditions:\n    if (name == \"Kotlin Coder\") {\n        println(\"You're a Kotlin coder!\")\n    } else {\n        println(\"You can become a Kotlin coder!\")\n    }\n}\n";
        elif language == "lua":
            return "-- Welcome to your Lua space!\n\nfunction main()\n    print(\"Hello, World!\")\n    \n    -- Try adding your own code below:\n    local name = \"Lua Coder\"\n    print(\"Welcome, \" .. name .. \"!\")\n    \n    -- You can use loops:\n    for i = 0, 2 do\n        print(\"Count: \" .. i)\n    end\n    \n    -- And conditions:\n    if name == \"Lua Coder\" then\n        print(\"You're a Lua coder!\")\n    else\n        print(\"You can become a Lua coder!\")\n    end\nend\n\n-- Call the main function\nmain()\n";
        elif language == "perl":
            return "# Welcome to your Perl space!\n\nsub main {\n    print \"Hello, World!\\n\";\n    \n    # Try adding your own code below:\n    my $name = \"Perl Coder\";\n    print \"Welcome, $name!\\n\";\n    \n    # You can use loops:\n    for (my $i = 0; $i < 3; $i++) {\n        print \"Count: $i\\n\";\n    }\n    \n    # And conditions:\n    if ($name eq \"Perl Coder\") {\n        print \"You're a Perl coder!\\n\";\n    } else {\n        print \"You can become a Perl coder!\\n\";\n    }\n}\n\n# Call the main function\nmain();\n";
        elif language == "r":
            return "# Welcome to your R space!\n\nmain <- function() {\n  print(\"Hello, World!\")\n  \n  # Try adding your own code below:\n  name <- \"R Coder\"\n  print(paste(\"Welcome,\", name, \"!\"))\n  \n  # You can use loops:\n  for (i in 0:2) {\n    print(paste(\"Count:\", i))\n  }\n  \n  # And conditions:\n  if (name == \"R Coder\") {\n    print(\"You're an R coder!\")\n  } else {\n    print(\"You can become an R coder!\")\n  }\n}\n\n# Call the main function\nmain()\n";
        elif language == "bash":
            return "#!/bin/bash\n\n# Welcome to your Bash space!\n\nmain() {\n    echo \"Hello, World!\"\n    \n    # Try adding your own code below:\n    name=\"Bash Coder\"\n    echo \"Welcome, $name!\"\n    \n    # You can use loops:\n    for i in {0..2}; do\n        echo \"Count: $i\"\n    done\n    \n    # And conditions:\n    if [[ \"$name\" == \"Bash Coder\" ]]; then\n        echo \"You're a Bash coder!\"\n    else\n        echo \"You can become a Bash coder!\"\n    fi\n}\n\n# Call the main function\nmain\n";
        
        # Generate reasonable default templates based on language
        language_capitalized = language.capitalize() 
        if language in ["javascript", "typescript", "scala", "dart", "solidity", "groovy"]:
            return f"// Welcome to your {language_capitalized} space!\n\nfunction main() {{\n  console.log(\"Hello, World!\");\n\n  // Write your code here\n}}\n\nmain();\n"
        elif language in ["python", "ruby", "perl", "r"]:
            return f"# Welcome to your {language_capitalized} space!\n\ndef main():\n    print(\"Hello, World!\")\n    \n    # Write your code here\n\n# Call the main function\nmain()\n"
        elif language in ["lua"]:
            return f"-- Welcome to your {language_capitalized} space!\n\nfunction main()\n    print(\"Hello, World!\")\n    \n    -- Write your code here\nend\n\nmain()\n"
        else:
            # C-style languages default
            return f"// Welcome to your {language_capitalized} space!\n\n// Main function\nvoid main() {{\n    // Write your code here\n    print(\"Hello, World!\");\n}}\n\nmain();\n"

    @classmethod
    def get_language_icon(cls, language: str) -> str:
        """Get the Font Awesome icon for a language."""
        icon_map = {
            "python": "fab fa-python",
            "javascript": "fab fa-js",
            "typescript": "fab fa-js",
            "java": "fab fa-java",
            "c": "fas fa-code",
            "cpp": "fas fa-code",
            "csharp": "fab fa-microsoft",
            "go": "fas fa-code",
            "ruby": "fas fa-gem",
            "rust": "fas fa-cogs",
            "php": "fab fa-php",
            "swift": "fab fa-swift",
            "kotlin": "fab fa-android",
            "dart": "fas fa-bullseye",
            "scala": "fas fa-code",
            "perl": "fas fa-code",
            "r": "fas fa-chart-line",
            "bash": "fas fa-terminal",
            "lua": "fas fa-moon",
            "haskell": "fas fa-lambda",
            "elixir": "fas fa-vial",
            "erlang": "fas fa-phone",
            "clojure": "fas fa-code",
            "julia": "fas fa-circle",
            "nim": "fas fa-feather",
            "crystal": "fas fa-gem",
            "ocaml": "fas fa-code",
            "zig": "fas fa-bolt",
        }
        return icon_map.get(language, "fas fa-code")
