import re
import sys
from pathlib import Path

def replace_innerhtml(file_path):
    # Read the file content
    with open(file_path, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Pattern to match innerHTML assignments with various quote types
    patterns = [
        (r'(\w+)\.innerHTML\s*=\s*(["\'])<i class="([^"]+fa-[a-z-]+)(?:\s+fa-([a-z-]+))?"[^>]*></i>\s*([^<]+)([^\2]*?)\2', 
         r'''\1.innerHTML = '\2<i class="\3\4"></i>\5\2' // TODO: Replace with safe DOM manipulation'''),
    ]
    
    # First, replace simple innerHTML assignments with comments
    for pattern, replacement in patterns:
        content = re.sub(pattern, replacement, content, flags=re.IGNORECASE)
    
    # Now implement the actual DOM manipulation replacements
    # Pattern 1: Spinner with text (e.g., '<i class="fas fa-spinner fa-spin"></i> Saving...')
    spinner_pattern = r'(\w+)\.innerHTML\s*=\s*["\']<i class="([^"]*fa-spinner[^"]*)"></i>\s*([^<"\']+)["\']'
    spinner_replacement = '''\n    // Clear existing content\n    while (\1.firstChild) {\n        \1.removeChild(\1.firstChild);\n    }\n    \n    // Create spinner icon\n    const spinnerIcon = document.createElement('i');\n    spinnerIcon.className = '\2';\n    \n    // Add text node\n    const textNode = document.createTextNode(' \3');\n    \n    // Assemble button content\n    \1.appendChild(spinnerIcon);\n    \1.appendChild(textNode);'''
    content = re.sub(spinner_pattern, spinner_replacement, content, flags=re.IGNORECASE)
    
    # Pattern 2: Save icon with text (e.g., '<i class="fas fa-save"></i> Save Changes')
    save_pattern = r'(\w+)\.innerHTML\s*=\s*["\']<i class="([^"]*fa-save[^"]*)"></i>\s*([^<"\']+)["\']'
    save_replacement = '''\n    // Clear existing content\n    while (\1.firstChild) {\n        \1.removeChild(\1.firstChild);\n    }\n    \n    // Create save icon\n    const saveIcon = document.createElement('i');\n    saveIcon.className = '\2';\n    \n    // Add text node\n    const textNode = document.createTextNode(' \3');\n    \n    // Assemble button content\n    \1.appendChild(saveIcon);\n    \1.appendChild(textNode);'''
    content = re.sub(save_pattern, save_replacement, content, flags=re.IGNORECASE)
    
    # Pattern 3: Play icon with text (e.g., '<i class="fas fa-play"></i> Run')
    play_pattern = r'(\w+)\.innerHTML\s*=\s*["\']<i class="([^"]*fa-play[^"]*)"></i>\s*([^<"\']+)["\']'
    play_replacement = '''\n    // Clear existing content\n    while (\1.firstChild) {\n        \1.removeChild(\1.firstChild);\n    }\n    \n    // Create play icon\n    const playIcon = document.createElement('i');\n    playIcon.className = '\2';\n    \n    // Add text node\n    const textNode = document.createTextNode(' \3');\n    \n    // Assemble button content\n    \1.appendChild(playIcon);\n    \1.appendChild(textNode);'''
    content = re.sub(play_pattern, play_replacement, content, flags=re.IGNORECASE)
    
    # Pattern 4: Rocket icon with text (e.g., '<i class="fas fa-rocket" style="color: white;"></i> Deploy')
    rocket_pattern = r'(\w+)\.innerHTML\s*=\s*["\']<i class="([^"]*fa-rocket[^"]*)"([^>]*)></i>\s*([^<"\']+)["\']'
    
    def rocket_replacer(match):
        var_name = match.group(1)
        icon_class = match.group(2)
        style = match.group(3).strip()
        text = match.group(4).strip()
        
        # Extract style attributes
        style_attrs = {}
        if style:
            for attr in style.split(';'):
                if ':' in attr:
                    key, value = attr.split(':', 1)
                    style_attrs[key.strip()] = value.strip()
        
        # Build the replacement
        replacement = [
            f"// Clear existing content\n    while ({var_name}.firstChild) {{\n        {var_name}.removeChild({var_name}.firstChild);\n    }}\n    \n    // Create rocket icon\n    const rocketIcon = document.createElement('i');\n    rocketIcon.className = '{icon_class}';"
        ]
        
        # Add style attributes
        for key, value in style_attrs.items():
            replacement.append(f"rocketIcon.style.{key} = '{value}';")
        
        # Add text node and assembly
        replacement.extend([
            f"\n    // Add text node\n    const textNode = document.createTextNode(' {text}');\n    \n    // Assemble button content\n    {var_name}.appendChild(rocketIcon);\n    {var_name}.appendChild(textNode);"
        ])
        
        return ''.join(replacement)
    
    content = re.sub(rocket_pattern, rocket_replacer, content, flags=re.IGNORECASE)
    
    # Pattern 5: Simple innerHTML clear (e.g., 'element.innerHTML = ""')
    clear_pattern = r'(\w+)\.innerHTML\s*=\s*["\']\s*["\']'
    clear_replacement = '''\n    // Clear existing content\n    while (\1.firstChild) {\n        \1.removeChild(\1.firstChild);\n    }'''
    content = re.sub(clear_pattern, clear_replacement, content, flags=re.IGNORECASE)
    
    # Write the updated content back to the file
    with open(file_path, 'w', encoding='utf-8') as file:
        file.write(content)
    
    return content

def main():
    if len(sys.argv) < 2:
        print("Usage: python fix_innerhtml.py <file1> [file2 ...]")
        sys.exit(1)
    
    for file_path in sys.argv[1:]:
        path = Path(file_path)
        if path.exists() and path.is_file():
            print(f"Processing {file_path}...")
            try:
                replace_innerhtml(file_path)
                print(f"Successfully updated {file_path}")
            except Exception as e:
                print(f"Error processing {file_path}: {str(e)}")
        else:
            print(f"File not found: {file_path}")

if __name__ == "__main__":
    main()
